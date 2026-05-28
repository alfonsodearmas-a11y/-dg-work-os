import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { isCronAuthorized } from '@/lib/notifications/email-utils';
import { prepareReport, type ReportTemplate } from '@/lib/intel/prepare-report';
import { resolveActiveDG } from '@/lib/intel/resolve-active-dg';
import {
  computeNextRunAt,
  type Frequency,
} from '@/lib/intel/schedule-utils';

/**
 * GET /api/cron/agency-scheduled-reports
 *
 * Vercel cron handler. Picks up active schedules whose next_run_at is in
 * the past and emails the report to their recipients.
 *
 * CRITICAL: claim-before-send. For each due row we first issue a
 * conditional UPDATE that advances next_run_at, asserting the observed
 * next_run_at value as a guard. Only the invocation whose UPDATE returns
 * exactly one row proceeds to render + email. This closes both
 * (a) the race where two cron ticks pick up the same row and
 * (b) the crash window where send succeeds but the post-send UPDATE
 *     fails, which would cause a double-send on the next tick.
 *
 * On send failure after a successful claim we record the error and leave
 * next_run_at advanced. A skipped occurrence is the safe failure mode
 * for a recurring report; a double-send is not. The schedule self-heals
 * on its next occurrence.
 *
 * Do not "fix" this back into a retry — the deliberate choice is to skip.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Row = {
  id: string;
  created_by_user_id: string | null;
  agency: string;
  recipients: string[];
  cover_message: string | null;
  frequency: Frequency;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number;
  timezone: string;
  template: ReportTemplate;
  next_run_at: string;
};

const CRON_SENDER_NAME = 'DG Work OS';
const BATCH_LIMIT = 50;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  const nowIso = startedAt.toISOString();

  const { data, error } = await supabaseAdmin
    .from('agency_scheduled_reports')
    .select(
      'id, created_by_user_id, agency, recipients, cover_message, frequency, day_of_week, day_of_month, send_hour, timezone, template, next_run_at',
    )
    .eq('active', true)
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    logger.error({ err: error }, 'scheduled-reports cron: select failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { id: string; message: string }[] = [];

  for (const row of rows) {
    const computedNext = computeNextRunAt(
      {
        frequency: row.frequency,
        day_of_week: row.day_of_week,
        day_of_month: row.day_of_month,
        send_hour: row.send_hour,
        timezone: row.timezone,
      },
      startedAt,
    );

    // Claim phase: only the invocation whose UPDATE matches the
    // observed next_run_at proceeds. Any other invocation gets zero
    // affected rows and skips the send entirely.
    const claim = await supabaseAdmin
      .from('agency_scheduled_reports')
      .update({
        next_run_at: computedNext.toISOString(),
        last_run_at: nowIso,
        last_error: null,
        last_error_at: null,
      })
      .eq('id', row.id)
      .eq('active', true)
      .eq('next_run_at', row.next_run_at)
      .select('id');

    if (claim.error) {
      logger.error({ err: claim.error, id: row.id }, 'scheduled-reports cron: claim failed');
      failed += 1;
      errors.push({ id: row.id, message: claim.error.message });
      continue;
    }
    if (!claim.data || claim.data.length === 0) {
      skipped += 1;
      continue;
    }
    claimed += 1;

    // Resolve audit attribution. If the creator was deactivated, attribute
    // the send to the active DG so institutional schedules outlive their
    // creators rather than nulling out.
    let attributedUserId = row.created_by_user_id;
    if (!attributedUserId) {
      const dg = await resolveActiveDG();
      attributedUserId = dg.userId;
    }

    try {
      const prepared = await prepareReport({
        agency: row.agency,
        template: row.template,
        coverMessage: row.cover_message,
        senderName: CRON_SENDER_NAME,
        senderEmail: null,
      });

      const sendResult = await sendEmail({
        to: row.recipients,
        subject: prepared.subject,
        html: prepared.emailHtml,
        text: prepared.emailText,
        attachments: [
          {
            filename: prepared.filename,
            content: prepared.pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error ?? 'sendEmail returned failure');
      }

      // Audit log entry. attributedUserId may still be null if no active
      // DG exists; we let the column accept it rather than blocking the
      // send. The audit row makes the scheduled send traceable either
      // way via source='scheduled'.
      const { error: insertErr } = await supabaseAdmin
        .from('agency_intel_reports')
        .insert({
          sent_by_user_id: attributedUserId,
          agency: prepared.data.agency,
          recipients: row.recipients,
          message: row.cover_message,
          source: 'scheduled',
          template: row.template,
        });
      if (insertErr) {
        logger.error(
          { err: insertErr, id: row.id },
          'scheduled-reports cron: audit insert failed (email sent successfully)',
        );
      }

      sent += 1;
    } catch (e) {
      // Send failure AFTER claim. Record the error; do NOT roll next_run_at
      // back. A skipped occurrence is the safe failure mode.
      const message = e instanceof Error ? e.message : String(e);
      logger.error({ err: e, id: row.id }, 'scheduled-reports cron: send failed after claim');
      await supabaseAdmin
        .from('agency_scheduled_reports')
        .update({ last_error: message, last_error_at: nowIso })
        .eq('id', row.id);
      failed += 1;
      errors.push({ id: row.id, message });
    }
  }

  return NextResponse.json({
    ok: true,
    considered: rows.length,
    claimed,
    sent,
    failed,
    skipped,
    errors,
  });
}
