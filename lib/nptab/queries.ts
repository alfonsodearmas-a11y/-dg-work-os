import { supabaseAdmin } from '@/lib/db-admin';
import { transaction } from '@/lib/db-pg';
import { logger } from '@/lib/logger';
import { rejectEmDash } from '@/lib/text/punctuation-guard';
import { allocateNptabReferenceNumber } from './reference-number';
import { writeNptabAuditEntriesTx, type NptabAuditEntryInput } from './audit';
import { nextQuarterEnd, periodLabel, periodToDates, quarterOf } from './period';
import type {
  NptabAuditEntry,
  NptabDeliveryMethod,
  NptabReport,
  NptabReportStatus,
  NptabReportTenderSnapshot,
  NptabQueueRowWithTender,
} from './types';

export {
  getActiveQueueRowsForTenders,
  getLatestReportsForTenders,
  type ActiveNptabQueueBrief,
  type NptabReportBrief,
} from './source-lookup';

// ── Queue ─────────────────────────────────────────────────────────────────

export async function listActiveQueue(): Promise<NptabQueueRowWithTender[]> {
  const { data, error } = await supabaseAdmin
    .from('nptab_report_queue')
    .select(
      'id, tender_id, queued_at, queued_by, reason, queued_by_user:queued_by ( name ), tender:tender_id ( description, agency, contractor )',
    )
    .is('dequeued_at', null)
    .is('included_in_report_id', null)
    .order('queued_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      tender_id: string;
      queued_at: string;
      queued_by: string;
      reason: string | null;
      queued_by_user: { name: string | null } | null;
      tender: { description: string | null; agency: string | null; contractor: string | null } | null;
    };
    return {
      id: r.id,
      tender_id: r.tender_id,
      queued_at: r.queued_at,
      queued_by: r.queued_by,
      queued_by_name: r.queued_by_user?.name ?? null,
      reason: r.reason,
      tender_title: r.tender?.description ?? null,
      tender_agency: r.tender?.agency ?? null,
      contract_value: null,
      days_past_sla: null,
      contractor: r.tender?.contractor ?? null,
    };
  });
}

export async function getActiveQueueRowForTender(tenderId: string): Promise<{ id: string; queued_at: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('nptab_report_queue')
    .select('id, queued_at')
    .eq('tender_id', tenderId)
    .is('dequeued_at', null)
    .is('included_in_report_id', null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, queued_at: data.queued_at } : null;
}

export async function queueTender(
  tenderId: string,
  userId: string,
  reason: string | null,
): Promise<{ id: string }> {
  if (reason) rejectEmDash(reason, 'reason');
  const { data, error } = await supabaseAdmin
    .from('nptab_report_queue')
    .insert({ tender_id: tenderId, queued_by: userId, reason: reason ?? null })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      const err = new Error('Already queued for the upcoming NPTAB report');
      (err as Error & { code?: string }).code = 'ALREADY_QUEUED';
      throw err;
    }
    logger.error({ err: error, tenderId }, 'queueTender failed');
    throw error;
  }
  return { id: data.id };
}

export async function dequeueTender(
  queueId: string,
  userId: string,
  reason: string | null,
): Promise<void> {
  if (reason) rejectEmDash(reason, 'dequeue_reason');
  const { error } = await supabaseAdmin
    .from('nptab_report_queue')
    .update({
      dequeued_at: new Date().toISOString(),
      dequeued_by: userId,
      dequeue_reason: reason ?? null,
    })
    .eq('id', queueId);
  if (error) throw error;
}

// ── Reports ───────────────────────────────────────────────────────────────

export async function listReports(): Promise<NptabReport[]> {
  const { data, error } = await supabaseAdmin
    .from('nptab_reports')
    .select('*')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('generated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as NptabReport[];
}

export async function getReportById(id: string): Promise<NptabReport | null> {
  const { data, error } = await supabaseAdmin
    .from('nptab_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NptabReport | null;
}

export async function getReportAuditLog(reportId: string): Promise<NptabAuditEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('nptab_report_audit_log')
    .select('*')
    .eq('report_id', reportId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return (data ?? []) as NptabAuditEntry[];
}

export async function getReportTenderSnapshots(reportId: string): Promise<NptabReportTenderSnapshot[]> {
  const { data, error } = await supabaseAdmin
    .from('nptab_report_queue')
    .select(
      'tender_id, tender:tender_id ( description, agency, contractor, stage, date_advertised )',
    )
    .eq('included_in_report_id', reportId);
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      tender_id: string;
      tender: {
        description: string | null;
        agency: string | null;
        contractor: string | null;
        stage: string;
        date_advertised: string | null;
      } | null;
    };
    const days = r.tender?.date_advertised
      ? Math.floor((now - new Date(r.tender.date_advertised).getTime()) / 86_400_000)
      : null;
    return {
      tender_id: r.tender_id,
      title: r.tender?.description ?? '',
      agency: r.tender?.agency ?? '',
      contract_value: null,
      days_past_sla: days,
      contractor: r.tender?.contractor ?? null,
      status: r.tender?.stage ?? '',
    };
  });
}

/**
 * Create a drafted report from the active queue. Locks queue rows, snapshots
 * them into the new report (sets included_in_report_id), writes audit entries.
 */
export async function createDraftFromQueue(userId: string): Promise<NptabReport> {
  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT id, tender_id FROM nptab_report_queue
       WHERE dequeued_at IS NULL AND included_in_report_id IS NULL
       FOR UPDATE`,
    );
    if (lockResult.rowCount === 0) {
      throw new Error('Queue is empty. Add tenders via the Escalate modal before generating a draft.');
    }
    const { year, quarter } = quarterOf(new Date());
    const { start, end } = periodToDates(year, quarter);

    const insertReport = await client.query(
      `INSERT INTO nptab_reports (period_start, period_end, generated_by, status, narrative, tender_count)
       VALUES ($1, $2, $3, 'drafted', '', 0)
       RETURNING *`,
      [start, end, userId],
    );
    const report = insertReport.rows[0] as NptabReport;

    const queueIds = lockResult.rows.map((r: { id: string }) => r.id);
    await client.query(
      `UPDATE nptab_report_queue SET included_in_report_id = $1 WHERE id = ANY($2::uuid[])`,
      [report.id, queueIds],
    );

    const audit: NptabAuditEntryInput[] = [
      {
        report_id: report.id,
        changed_by: userId,
        field_changed: 'status_transition',
        old_value: null,
        new_value: 'drafted',
      },
      {
        report_id: report.id,
        changed_by: userId,
        field_changed: 'included_tenders',
        old_value: null,
        new_value: String(queueIds.length),
      },
    ];
    await writeNptabAuditEntriesTx(client, audit);
    return report;
  });
}

export async function updateReportNarrative(
  reportId: string,
  narrative: string,
  userId: string,
): Promise<NptabReport> {
  rejectEmDash(narrative, 'narrative');
  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT * FROM nptab_reports WHERE id = $1 FOR UPDATE`,
      [reportId],
    );
    if (lockResult.rowCount === 0) throw new Error('Report not found');
    const before = lockResult.rows[0] as NptabReport;
    if (before.status !== 'drafted') {
      throw new Error('Narrative is editable only while the report is drafted');
    }
    const update = await client.query(
      `UPDATE nptab_reports SET narrative = $2 WHERE id = $1 RETURNING *`,
      [reportId, narrative],
    );
    if (before.narrative !== narrative) {
      await writeNptabAuditEntriesTx(client, [
        {
          report_id: reportId,
          changed_by: userId,
          field_changed: 'narrative',
          old_value: before.narrative,
          new_value: narrative,
        },
      ]);
    }
    return update.rows[0] as NptabReport;
  });
}

/**
 * Mark a drafted report submitted. Allocates the reference number, computes
 * snapshot totals from included tenders, and renders the PDF as a validation
 * step. If renderPdf throws, the transaction rolls back.
 */
export async function submitReport(
  reportId: string,
  deliveryMethod: NptabDeliveryMethod,
  deliveredTo: string,
  userId: string,
  renderPdf: (
    report: NptabReport,
    tenders: NptabReportTenderSnapshot[],
  ) => Promise<Buffer>,
): Promise<NptabReport> {
  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT * FROM nptab_reports WHERE id = $1 FOR UPDATE`,
      [reportId],
    );
    if (lockResult.rowCount === 0) throw new Error('Report not found');
    const before = lockResult.rows[0] as NptabReport;
    if (before.status !== 'drafted') {
      throw new Error(`Cannot submit report in state: ${before.status}`);
    }

    const tendersResult = await client.query(
      `SELECT q.tender_id, t.description AS title, t.agency, t.contractor, t.stage, t.date_advertised
       FROM nptab_report_queue q
       LEFT JOIN tender t ON t.id::text = q.tender_id
       WHERE q.included_in_report_id = $1`,
      [reportId],
    );
    const now = Date.now();
    const tenders: NptabReportTenderSnapshot[] = tendersResult.rows.map((r: {
      tender_id: string; title: string | null; agency: string | null;
      contractor: string | null; stage: string | null; date_advertised: string | null;
    }) => ({
      tender_id: r.tender_id,
      title: r.title ?? '',
      agency: r.agency ?? '',
      contract_value: null,
      days_past_sla: r.date_advertised
        ? Math.floor((now - new Date(r.date_advertised).getTime()) / 86_400_000)
        : null,
      contractor: r.contractor,
      status: r.stage ?? '',
    }));

    const tenderCount = tenders.length;
    const totalValue = tenders.reduce((s, t) => s + (t.contract_value ?? 0), 0);
    const referenceNumber = await allocateNptabReferenceNumber(new Date(), client);
    const submittedAt = new Date().toISOString();

    const update = await client.query(
      `UPDATE nptab_reports
         SET status = 'submitted',
             reference_number = $2,
             submitted_at = $3,
             delivery_method = $4,
             delivered_to = $5,
             tender_count = $6,
             total_value = $7
       WHERE id = $1
       RETURNING *`,
      [reportId, referenceNumber, submittedAt, deliveryMethod, deliveredTo, tenderCount, totalValue],
    );
    const after = update.rows[0] as NptabReport;

    await writeNptabAuditEntriesTx(client, [
      { report_id: reportId, changed_by: userId, field_changed: 'status_transition', old_value: 'drafted', new_value: 'submitted' },
      { report_id: reportId, changed_by: userId, field_changed: 'reference_number',  old_value: null, new_value: referenceNumber },
      { report_id: reportId, changed_by: userId, field_changed: 'submitted_at',      old_value: null, new_value: submittedAt },
      { report_id: reportId, changed_by: userId, field_changed: 'delivery_method',   old_value: null, new_value: deliveryMethod },
      { report_id: reportId, changed_by: userId, field_changed: 'delivered_to',      old_value: null, new_value: deliveredTo },
      { report_id: reportId, changed_by: userId, field_changed: 'tender_count',      old_value: '0', new_value: String(tenderCount) },
    ]);

    // Validate the PDF can render. If it throws, the transaction rolls back.
    await renderPdf(after, tenders);

    return after;
  });
}

export async function closeReport(
  reportId: string,
  reason: string,
  userId: string,
): Promise<NptabReport> {
  rejectEmDash(reason, 'closure_reason');
  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT * FROM nptab_reports WHERE id = $1 FOR UPDATE`,
      [reportId],
    );
    if (lockResult.rowCount === 0) throw new Error('Report not found');
    const before = lockResult.rows[0] as NptabReport;
    if (before.status === 'closed') throw new Error('Report already closed');

    const closedAt = new Date().toISOString();
    const update = await client.query(
      `UPDATE nptab_reports SET status = 'closed', closed_at = $2, closure_reason = $3 WHERE id = $1 RETURNING *`,
      [reportId, closedAt, reason],
    );
    await writeNptabAuditEntriesTx(client, [
      { report_id: reportId, changed_by: userId, field_changed: 'status_transition', old_value: before.status, new_value: 'closed' },
      { report_id: reportId, changed_by: userId, field_changed: 'closure_reason',    old_value: null,         new_value: reason },
    ]);
    return update.rows[0] as NptabReport;
  });
}

export async function addTenderToReport(
  reportId: string,
  tenderId: string,
  userId: string,
): Promise<void> {
  return transaction(async (client) => {
    const reportRow = await client.query(`SELECT status FROM nptab_reports WHERE id = $1`, [reportId]);
    if (reportRow.rowCount === 0) throw new Error('Report not found');
    if (reportRow.rows[0].status !== 'drafted') throw new Error('Can only add tenders to a drafted report');

    await client.query(
      `INSERT INTO nptab_report_queue (tender_id, queued_by, included_in_report_id)
       VALUES ($1, $2, $3)`,
      [tenderId, userId, reportId],
    );
    await writeNptabAuditEntriesTx(client, [
      { report_id: reportId, changed_by: userId, field_changed: 'tender_added', old_value: null, new_value: tenderId },
    ]);
  });
}

export async function removeTenderFromReport(
  reportId: string,
  tenderId: string,
  userId: string,
): Promise<void> {
  return transaction(async (client) => {
    const reportRow = await client.query(`SELECT status FROM nptab_reports WHERE id = $1`, [reportId]);
    if (reportRow.rowCount === 0) throw new Error('Report not found');
    if (reportRow.rows[0].status !== 'drafted') throw new Error('Can only remove tenders from a drafted report');

    await client.query(
      `UPDATE nptab_report_queue
         SET dequeued_at = NOW(),
             dequeued_by = $3,
             dequeue_reason = 'Removed from report'
       WHERE included_in_report_id = $1 AND tender_id = $2`,
      [reportId, tenderId, userId],
    );
    await writeNptabAuditEntriesTx(client, [
      { report_id: reportId, changed_by: userId, field_changed: 'tender_removed', old_value: tenderId, new_value: null },
    ]);
  });
}

// ── Period helper re-export ───────────────────────────────────────────────
export function getUpcomingPeriodLabel(): string {
  const next = nextQuarterEnd(new Date());
  return periodLabel(next.start, next.end);
}
