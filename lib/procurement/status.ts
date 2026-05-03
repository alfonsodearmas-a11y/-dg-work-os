// ── Tender status transition writer ──────────────────────────────────────────
//
// Single chokepoint for inserting rows into tender_status_decision. The
// AFTER INSERT trigger sync_tender_status_from_decision keeps tender.status
// aligned. decision_id links the ledger to the universal procurement_decision
// audit log.

import { supabaseAdmin } from '@/lib/db';

export const TENDER_STATUSES = [
  'active',
  'missing_pending_decision',
  'withdrawn',
  'completed_outside_psip',
  'agency_error',
  'archived',
] as const;
export type TenderStatus = typeof TENDER_STATUSES[number];

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  active: 'Active',
  missing_pending_decision: 'Missing — pending decision',
  withdrawn: 'Withdrawn',
  completed_outside_psip: 'Completed (off PSIP)',
  agency_error: 'Agency error',
  archived: 'Archived',
};

// Statuses that exit a tender from the active oversight surfaces. The inbox
// surfaces missing_pending_decision; everything else in this set is
// post-decision / read-only history. archived is the universal terminal.
export const NON_ACTIVE_TERMINAL_STATUSES: ReadonlyArray<TenderStatus> = [
  'withdrawn',
  'completed_outside_psip',
  'agency_error',
  'archived',
];

export interface RecordStatusTransitionInput {
  tender_id: string;
  status_after: TenderStatus;
  status_before?: TenderStatus | null;
  decision_id?: string | null;
  reason_code?: string | null;
  decided_by: string;
  decided_role: string;
}

export async function recordStatusTransition(input: RecordStatusTransitionInput): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('tender_status_decision')
    .insert({
      tender_id: input.tender_id,
      status_before: input.status_before ?? null,
      status_after: input.status_after,
      decision_id: input.decision_id ?? null,
      reason_code: input.reason_code ?? null,
      decided_by: input.decided_by,
      decided_role: input.decided_role,
    })
    .select('id')
    .single();
  if (error || !data) throw error || new Error('Failed to record tender status transition');
  return data.id as string;
}

export async function recordStatusTransitionsBatch(rows: RecordStatusTransitionInput[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin
    .from('tender_status_decision')
    .insert(
      rows.map((r) => ({
        tender_id: r.tender_id,
        status_before: r.status_before ?? null,
        status_after: r.status_after,
        decision_id: r.decision_id ?? null,
        reason_code: r.reason_code ?? null,
        decided_by: r.decided_by,
        decided_role: r.decided_role,
      })),
    );
  if (error) throw error;
}
