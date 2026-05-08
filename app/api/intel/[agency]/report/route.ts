import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { getAgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { renderAgencyIntelReportPDF } from '@/lib/pdf/agency-intel-report';
import { renderIntelBriefPDF } from '@/lib/pdf/intel-brief-render';
import { validateEmailList, parseEmailList } from '@/lib/email-validation';
import { escapeHtml } from '@/lib/notifications/email-templates';
import { isIntelAgency } from '@/lib/agencies';
import { logger } from '@/lib/logger';

/**
 * POST /api/intel/[agency]/report
 *
 * Renders an Agency Intel PDF (server-side via @react-pdf/renderer), emails
 * it to the caller-supplied recipients with the triggering user's email as
 * Reply-To, and logs the send to agency_intel_reports (which doubles as the
 * rate-limit primitive).
 *
 * Rate limit: 10 sends per user per rolling 60 minutes — enforced as
 * `COUNT(*) FROM agency_intel_reports WHERE sent_by_user_id = $u AND
 * sent_at > now() - INTERVAL '1 hour'`. Reject 11th with HTTP 429.
 */

export const runtime = 'nodejs'; // @react-pdf/renderer requires Node, not Edge.
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // PDF rendering can spike past the project's 60s default.

const RATE_LIMIT_PER_HOUR = 10;

const bodySchema = z.object({
  recipients: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .transform((v) => (Array.isArray(v) ? v : parseEmailList(v))),
  message: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agency: string }> },
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { agency } = await params;
  const lower = agency.toLowerCase();
  if (!isIntelAgency(lower)) {
    return NextResponse.json({ error: 'Unknown agency' }, { status: 404 });
  }
  if (!canAccessAgency(session.user.role, session.user.agency, lower)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const candidates = parsed.data.recipients
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const { valid, invalid } = validateEmailList(candidates);
  if (valid.length === 0) {
    return NextResponse.json(
      {
        error: invalid.length > 0 ? 'No valid recipients' : 'Recipients required',
        invalid,
      },
      { status: 400 },
    );
  }

  // Rate limit: 10 sends per user per rolling hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countErr } = await supabaseAdmin
    .from('agency_intel_reports')
    .select('id', { count: 'exact', head: true })
    .eq('sent_by_user_id', session.user.id)
    .gte('sent_at', oneHourAgo);

  if (countErr) {
    logger.error({ err: countErr }, 'report: rate-limit count failed');
    return NextResponse.json({ error: 'Rate limit check failed' }, { status: 500 });
  }

  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      {
        error: 'Rate limit reached',
        message: `You can send at most ${RATE_LIMIT_PER_HOUR} reports per hour. Try again later.`,
      },
      { status: 429 },
    );
  }

  // Fetch the data the page would show
  let data;
  try {
    data = await getAgencyIntelData(lower);
  } catch (err) {
    logger.error({ err, agency: lower }, 'report: getAgencyIntelData failed');
    return NextResponse.json({ error: 'Failed to load agency data' }, { status: 500 });
  }

  // Render PDF. The editorial Intel Brief is the default; the legacy
  // dashboard report stays reachable via `?template=legacy` as an escape
  // hatch in case the editorial render hits an edge case in production.
  const template =
    request.nextUrl.searchParams.get('template') === 'legacy' ? 'legacy' : 'editorial';

  const generatedBy = session.user.name || session.user.email;
  let pdfBuffer: Buffer;
  try {
    if (template === 'legacy') {
      pdfBuffer = await renderAgencyIntelReportPDF({ data, generatedBy });
    } else {
      // The Intel Brief is for the Director General by definition. Resolve
      // the canonical recipient name from the users table; if no DG row
      // exists yet, the sender's name is the safe fallback.
      const recipientName = await resolveDGRecipientName(session.user.name || session.user.email);
      pdfBuffer = await renderIntelBriefPDF({ data, generatedBy, recipientName });
    }
  } catch (err) {
    logger.error({ err, agency: lower, template }, 'report: PDF render failed');
    return NextResponse.json({ error: 'Failed to render PDF' }, { status: 500 });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${lower}-intel-${dateStamp}.pdf`;
  const subject = `[DG Work OS] ${data.agency} Intel Report — ${dateStamp}`;

  const html = renderEmailHtml({
    agency: data.agency,
    senderName: session.user.name || session.user.email,
    senderEmail: session.user.email,
    message: parsed.data.message,
    dateStamp,
  });
  const text = renderEmailText({
    agency: data.agency,
    senderName: session.user.name || session.user.email,
    senderEmail: session.user.email,
    message: parsed.data.message,
    dateStamp,
  });

  const sendResult = await sendEmail({
    to: valid,
    subject,
    html,
    text,
    replyTo: session.user.email,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  if (!sendResult.success) {
    logger.error(
      { err: sendResult.error, agency: lower, recipientCount: valid.length },
      'report: sendEmail failed',
    );
    return NextResponse.json(
      { error: 'Failed to send email', detail: sendResult.error },
      { status: 502 },
    );
  }

  // Audit log + rate-limit primitive
  const { error: insertErr } = await supabaseAdmin.from('agency_intel_reports').insert({
    sent_by_user_id: session.user.id,
    agency: data.agency,
    recipients: valid,
    message: parsed.data.message ?? null,
  });
  if (insertErr) {
    // Don't fail the response — the email was already sent. Log for later.
    logger.error(
      { err: insertErr, agency: lower },
      'report: audit log insert failed (email sent successfully)',
    );
  }

  return NextResponse.json({
    success: true,
    sent_to: valid,
    invalid_skipped: invalid,
    remaining_this_hour: Math.max(0, RATE_LIMIT_PER_HOUR - (recentCount ?? 0) - 1),
  });
}

// ---------------------------------------------------------------------------
// Email body rendering — kept inline so the report email's footer / CTA is
// owned by this route. The reusable templates in lib/notifications/* are for
// notification fan-out, not transactional report attachments.
// ---------------------------------------------------------------------------

function renderEmailHtml(params: {
  agency: string;
  senderName: string;
  senderEmail: string;
  message?: string;
  dateStamp: string;
}): string {
  const message = params.message
    ? `<p style="color:#cbd5e1;font-size:14px;margin:16px 0;border-left:3px solid #d4af37;padding-left:12px;">${escapeHtml(
        params.message,
      )}</p>`
    : '';
  return `<!DOCTYPE html><html><body style="margin:0;background:#0a1628;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0a1628;border:1px solid #2d3a52;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1a2744,#0f1d32);padding:28px;text-align:center;">
        <h1 style="color:#d4af37;margin:0 0 4px;font-size:20px;">${escapeHtml(
          params.agency,
        )} Intel Report</h1>
        <p style="color:#64748b;margin:0;font-size:13px;">Ministry of Public Utilities &amp; Aviation</p>
      </div>
      <div style="padding:24px;color:#e2e8f0;font-size:14px;">
        <p>Hello,</p>
        <p>${escapeHtml(params.senderName)} has shared the ${escapeHtml(
          params.agency,
        )} Intel Report — ${params.dateStamp}.</p>
        ${message}
        <p style="color:#64748b;font-size:12px;margin-top:24px;">
          Reply-to: ${escapeHtml(params.senderEmail)}<br/>
          See the attached PDF for the full snapshot.
        </p>
        <p style="color:#4a5568;font-size:11px;border-top:1px solid #2d3a52;padding-top:12px;margin-top:24px;">
          You received this because ${escapeHtml(
            params.senderName,
          )} explicitly added your address. Reply to opt out.
        </p>
      </div>
    </div>
  </body></html>`;
}

/**
 * Resolve the canonical Director General name. The Intel Brief is
 * addressed to the DG regardless of who clicked Generate Report, so we
 * query the users table for the active dg-role row. When no such row
 * exists (or a senior role is acting), fall back to the sender's name so
 * the lede always renders something sensible.
 */
async function resolveDGRecipientName(senderFallback: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('name')
    .eq('role', 'dg')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error }, 'resolveDGRecipientName: lookup failed; using sender');
    return senderFallback;
  }
  return data?.name || senderFallback;
}

function renderEmailText(params: {
  agency: string;
  senderName: string;
  senderEmail: string;
  message?: string;
  dateStamp: string;
}): string {
  const lines = [
    `${params.agency} Intel Report — ${params.dateStamp}`,
    `Ministry of Public Utilities & Aviation`,
    '',
    `${params.senderName} has shared the ${params.agency} Intel Report.`,
  ];
  if (params.message) lines.push('', params.message);
  lines.push('', `Reply-to: ${params.senderEmail}`, 'See the attached PDF for the full snapshot.');
  return lines.join('\n');
}

