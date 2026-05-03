// ── Procurement decision ledger writer ───────────────────────────────────────
//
// Single chokepoint for inserting rows into procurement_decision. Every queue
// action (Archive, Resurrect, Skip, Match, Create-from-review, Assign-stage,
// status_change) flows through here so the audit log is uniformly structured.
//
// Schema is enforced by migration 095_procurement_decision_log.sql:
//   - decision_type vocabulary is closed (CHECK constrained)
//   - reason_code vocabulary is descriptive and per-decision-type, owned here
//
// approval_state defaults to 'none' until the Phase 3 approval-gate flow lands.

import { supabaseAdmin } from '@/lib/db';

export type ProcurementDecisionType =
  | 'archive'
  | 'unarchive'
  | 'resurrect'
  | 'revoke_tracking'
  | 'skip'
  | 'permanent_ignore'
  | 'match'
  | 'create_from_review'
  | 'assign_stage'
  | 'status_change';

export type ProcurementDecisionTarget = 'tender' | 'review_row';

export interface RecordDecisionInput {
  decision_type: ProcurementDecisionType;
  target_kind: ProcurementDecisionTarget;
  target_id: string;
  agency: string;
  actor_id: string;
  actor_role: string;
  reason_code?: string | null;
  reason_text?: string | null;
}

export async function recordDecision(input: RecordDecisionInput): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('procurement_decision')
    .insert({
      decision_type: input.decision_type,
      target_kind: input.target_kind,
      target_id: input.target_id,
      agency: input.agency,
      actor_id: input.actor_id,
      actor_role: input.actor_role,
      reason_code: input.reason_code ?? null,
      reason_text: input.reason_text ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw error || new Error('Failed to record procurement decision');
  return data.id as string;
}
