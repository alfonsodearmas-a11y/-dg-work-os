import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { sendEmail } from '@/lib/email';
import { validateEmailList, parseEmailList } from '@/lib/email-validation';
import { isIntelAgency } from '@/lib/agencies';
import { logger } from '@/lib/logger';
import { prepareReport, type ReportTemplate } from '@/lib/intel/prepare-report';

/**
 * POST /api/intel/[agency]/report
 *
 * Renders an Agency Intel PDF and emails it to the caller-supplied
 * recipients. Plain template is the default. The editorial Intel Brief
 * stays reachable via `?template=editorial` for one release.
 *
 * Rate limit: 10 sends per user per rolling 60 minutes, counted against
 * manual sends only. Scheduled sends from the cron handler do not
 * consume a user's hourly budget.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
  const result = await requireRole(['superadmin', 'agency_manager']);
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

  // Rate limit: 10 manual sends per user per rolling hour. Scheduled-source
  // rows from the cron handler do not count.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countErr } = await supabaseAdmin
    .from('agency_intel_reports')
    .select('id', { count: 'exact', head: true })
    .eq('sent_by_user_id', session.user.id)
    .eq('source', 'manual')
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

  const template: ReportTemplate =
    request.nextUrl.searchParams.get('template') === 'editorial' ? 'editorial' : 'plain';

  const senderName = session.user.name || session.user.email;
  let prepared;
  try {
    prepared = await prepareReport({
      agency: lower,
      template,
      coverMessage: parsed.data.message ?? null,
      senderName,
      senderEmail: session.user.email ?? null,
    });
  } catch (err) {
    logger.error({ err, agency: lower, template }, 'report: prepareReport failed');
    return NextResponse.json({ error: 'Failed to render report' }, { status: 500 });
  }

  const sendResult = await sendEmail({
    to: valid,
    subject: prepared.subject,
    html: prepared.emailHtml,
    text: prepared.emailText,
    replyTo: session.user.email,
    attachments: [
      {
        filename: prepared.filename,
        content: prepared.pdfBuffer,
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

  const { error: insertErr } = await supabaseAdmin.from('agency_intel_reports').insert({
    sent_by_user_id: session.user.id,
    agency: prepared.data.agency,
    recipients: valid,
    message: parsed.data.message ?? null,
    source: 'manual',
    template,
  });
  if (insertErr) {
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
