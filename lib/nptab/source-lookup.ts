import { supabaseAdmin } from '@/lib/db-admin';
import { nextQuarterEnd, periodLabel } from './period';

export interface ActiveNptabQueueBrief {
  queue_id: string;
  queued_at: string;
  upcoming_period_label: string;
}

export interface NptabReportBrief {
  report_id: string;
  reference_number: string;
  submitted_at: string;
}

/**
 * Active queue rows for a set of tender IDs (no report assigned, not dequeued).
 * Source-lookup only — does not pull in db-pg, safe to import from server hot paths.
 */
export async function getActiveQueueRowsForTenders(
  tenderIds: string[],
): Promise<Map<string, ActiveNptabQueueBrief>> {
  const out = new Map<string, ActiveNptabQueueBrief>();
  if (tenderIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from('nptab_report_queue')
    .select('id, tender_id, queued_at')
    .in('tender_id', tenderIds)
    .is('dequeued_at', null)
    .is('included_in_report_id', null)
    .order('queued_at', { ascending: false });
  if (error) throw error;
  const next = nextQuarterEnd(new Date());
  const upcomingLabel = periodLabel(next.start, next.end);
  for (const row of data ?? []) {
    if (out.has(row.tender_id)) continue;
    out.set(row.tender_id, {
      queue_id: row.id,
      queued_at: row.queued_at,
      upcoming_period_label: upcomingLabel,
    });
  }
  return out;
}

/**
 * Latest submitted report that included each tender (via included_in_report_id),
 * keyed by tender_id. Used by the NptabSourceBanner on procurement cards.
 */
export async function getLatestReportsForTenders(
  tenderIds: string[],
): Promise<Map<string, NptabReportBrief>> {
  const out = new Map<string, NptabReportBrief>();
  if (tenderIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from('nptab_report_queue')
    .select(
      'tender_id, included_in_report_id, report:included_in_report_id ( id, reference_number, submitted_at, status )',
    )
    .in('tender_id', tenderIds)
    .not('included_in_report_id', 'is', null);
  if (error) throw error;
  for (const rawRow of data ?? []) {
    const row = rawRow as unknown as {
      tender_id: string;
      included_in_report_id: string | null;
      report:
        | { id: string; reference_number: string | null; submitted_at: string | null; status: string }
        | { id: string; reference_number: string | null; submitted_at: string | null; status: string }[]
        | null;
    };
    const report = Array.isArray(row.report) ? row.report[0] : row.report;
    if (!report || report.status !== 'submitted' || !report.reference_number || !report.submitted_at) continue;
    const existing = out.get(row.tender_id);
    if (existing && new Date(existing.submitted_at).getTime() >= new Date(report.submitted_at).getTime()) continue;
    out.set(row.tender_id, {
      report_id: report.id,
      reference_number: report.reference_number,
      submitted_at: report.submitted_at,
    });
  }
  return out;
}
