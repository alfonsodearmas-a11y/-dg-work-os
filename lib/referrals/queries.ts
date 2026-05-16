import { supabaseAdmin } from '@/lib/db';
import { transaction } from '@/lib/db-pg';
import { logger } from '@/lib/logger';
import { rejectEmDash } from './em-dash-guard';
import { allocateReferenceNumber } from './reference-number';
import { deriveNextStatus, type TransitionTrigger } from './status-machine';
import { writeAuditEntriesTx, writeAuditEntries, type AuditEntry } from './audit';
import type {
  Referral,
  ReferralAuditEntry,
  ReferralStatus,
  ReferralRequestedAction,
  ReferralSourceType,
  ReferralDeliveryMethod,
  ReferralSummary,
  ReferralWithReferrer,
} from './types';

export {
  getActiveReferralForSource,
  getActiveReferralsForSources,
  type ActiveReferralBrief,
} from './source-lookup';

const TEXT_FIELDS_WITH_EMDASH_GUARD = [
  'background',
  'current_status',
  'recommendation',
  'closure_note',
  'minister_direction',
  'minister_notes',
  'title',
] as const;

export interface CreateReferralInput {
  source_type: ReferralSourceType;
  source_id: string | null;
  agency: string;
  title: string;
  days_overdue: number | null;
  contract_value: number | null;
  background: string;
  current_status: string;
  recommendation: string;
  requested_action: ReferralRequestedAction;
}

export interface ListReferralsFilters {
  status?: ReferralStatus[];
  agency?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export type ReferralPatch = {
  delivery_method?: ReferralDeliveryMethod | null;
  delivered_to?: string | null;
  minister_direction?: string | null;
  closure_note?: string | null;
  background?: string;
  current_status?: string;
  recommendation?: string;
  requested_action?: ReferralRequestedAction;
  minister_acknowledged_at?: string | null;
  minister_notes?: string | null;
};

export interface UpdateOptions {
  manualStatusOverride?: { target: ReferralStatus; reason: string };
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listReferrals(filters: ListReferralsFilters): Promise<ReferralSummary[]> {
  let q = supabaseAdmin
    .from('ministerial_referrals')
    .select('id, reference_number, submitted_at, agency, title, requested_action, status')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (filters.status?.length) q = q.in('status', filters.status);
  if (filters.agency?.length) q = q.in('agency', filters.agency);
  if (filters.dateFrom) q = q.gte('submitted_at', filters.dateFrom);
  if (filters.dateTo) q = q.lte('submitted_at', filters.dateTo);

  const { data, error } = await q;
  if (error) throw error;

  const now = Date.now();
  return (data ?? []).map((row) => ({
    id: row.id,
    reference_number: row.reference_number,
    submitted_at: row.submitted_at,
    agency: row.agency,
    title: row.title,
    requested_action: row.requested_action,
    status: row.status,
    days_since_submission: row.submitted_at
      ? Math.floor((now - new Date(row.submitted_at).getTime()) / 86_400_000)
      : null,
  }));
}

export async function listReferralsForMinister(): Promise<ReferralSummary[]> {
  return listReferrals({
    status: ['submitted', 'with_minister', 'direction_given', 'closed'],
  });
}

export async function getReferralById(id: string): Promise<ReferralWithReferrer | null> {
  const { data, error } = await supabaseAdmin
    .from('ministerial_referrals')
    .select('*, referrer:referred_by ( name, email, formal_title )')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error({ err: error, id }, 'getReferralById failed');
    throw error;
  }
  if (!data) return null;

  const { referrer, ...row } = data as Referral & {
    referrer: { name: string | null; email: string | null; formal_title: string | null } | null;
  };
  return {
    ...row,
    referrer_name: referrer?.name ?? null,
    referrer_email: referrer?.email ?? null,
    referrer_title: referrer?.formal_title ?? null,
  };
}

export async function getReferralAuditLog(referralId: string): Promise<ReferralAuditEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('referral_audit_log')
    .select('*')
    .eq('referral_id', referralId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReferralAuditEntry[];
}

// ── Writes ─────────────────────────────────────────────────────────────────

function guardEmDashes(patch: Record<string, unknown>): void {
  for (const field of TEXT_FIELDS_WITH_EMDASH_GUARD) {
    const v = patch[field];
    if (typeof v === 'string') rejectEmDash(v, field);
  }
}

export async function createReferralDraft(input: CreateReferralInput, userId: string): Promise<Referral> {
  guardEmDashes(input as unknown as Record<string, unknown>);
  // Recommendation length is enforced only on submit; drafts may be partial.

  const { data, error } = await supabaseAdmin
    .from('ministerial_referrals')
    .insert({
      referred_by: userId,
      source_type: input.source_type,
      source_id: input.source_id,
      agency: input.agency,
      title: input.title,
      days_overdue: input.days_overdue,
      contract_value: input.contract_value,
      background: input.background ?? '',
      current_status: input.current_status ?? '',
      recommendation: input.recommendation ?? '',
      requested_action: input.requested_action,
      status: 'drafted',
    })
    .select()
    .single();
  if (error) {
    logger.error({ err: error }, 'createReferralDraft failed');
    throw error;
  }
  // Record creation in the audit log (best-effort, non-transactional with insert).
  await writeAuditEntries([
    {
      referral_id: data.id,
      changed_by: userId,
      field_changed: 'status_transition',
      old_value: null,
      new_value: 'drafted',
    },
  ]);
  return data as Referral;
}

/**
 * Atomically lock the draft, validate, allocate a reference number, render the
 * PDF (validation), and flip status to 'submitted'. The PDF renderer is passed
 * in so callers don't need to import it (and tests can stub it).
 */
export async function submitReferral(
  id: string,
  userId: string,
  renderPdf: (referral: Referral) => Promise<Buffer>,
): Promise<Referral> {
  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT * FROM ministerial_referrals WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (lockResult.rowCount === 0) {
      throw new Error('Referral not found');
    }
    const before = lockResult.rows[0] as Referral;
    if (before.status !== 'drafted') {
      throw new Error(`Cannot submit referral in state: ${before.status}`);
    }
    if (before.recommendation.trim().length < 50) {
      throw new Error('Recommendation must be at least 50 characters before submission');
    }
    guardEmDashes(before as unknown as Record<string, unknown>);

    const referenceNumber = await allocateReferenceNumber(new Date(), client);
    const submittedAtIso = new Date().toISOString();

    const updateResult = await client.query(
      `UPDATE ministerial_referrals
         SET status = 'submitted',
             reference_number = $2,
             submitted_at = $3
       WHERE id = $1
       RETURNING *`,
      [id, referenceNumber, submittedAtIso],
    );
    const after = updateResult.rows[0] as Referral;

    await writeAuditEntriesTx(client, [
      {
        referral_id: id,
        changed_by: userId,
        field_changed: 'status_transition',
        old_value: 'drafted',
        new_value: 'submitted',
      },
      {
        referral_id: id,
        changed_by: userId,
        field_changed: 'reference_number',
        old_value: null,
        new_value: referenceNumber,
      },
      {
        referral_id: id,
        changed_by: userId,
        field_changed: 'submitted_at',
        old_value: null,
        new_value: submittedAtIso,
      },
    ]);

    // Validate the PDF can render. If it throws, the transaction rolls back.
    // The Buffer is discarded; downloads always re-render on demand.
    await renderPdf(after);

    return after;
  });
}

function pickTrigger(patch: ReferralPatch): TransitionTrigger | null {
  // Order matters when multiple log-fields are set in one call (rare but possible).
  if (patch.closure_note != null) return 'close';
  if (patch.minister_direction != null) return 'log_direction';
  if (patch.minister_acknowledged_at != null) return 'minister_acknowledge';
  if (patch.delivery_method != null || patch.delivered_to != null) return 'mark_delivered';
  return null;
}

export async function updateReferralFields(
  id: string,
  patch: ReferralPatch,
  userId: string,
  options: UpdateOptions = {},
): Promise<Referral> {
  guardEmDashes(patch as unknown as Record<string, unknown>);

  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT * FROM ministerial_referrals WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (lockResult.rowCount === 0) throw new Error('Referral not found');
    const before = lockResult.rows[0] as Referral;

    // Build the SET clause from patch + derived timestamp side-effects.
    const set: Record<string, unknown> = {};
    const auditEntries: AuditEntry[] = [];
    const now = new Date().toISOString();

    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      set[k] = v;
    }

    if (patch.delivery_method != null || patch.delivered_to != null) {
      if (!before.delivered_at) set['delivered_at'] = now;
    }
    if (patch.minister_direction != null && !before.direction_logged_at) {
      set['direction_logged_at'] = now;
    }
    if (patch.closure_note != null && !before.closed_at) {
      set['closed_at'] = now;
    }

    let nextStatus: ReferralStatus = before.status;
    if (options.manualStatusOverride) {
      const { target, reason } = options.manualStatusOverride;
      nextStatus = deriveNextStatus(before.status, 'manual', target);
      set['status'] = nextStatus;
      auditEntries.push({
        referral_id: id,
        changed_by: userId,
        field_changed: 'status_transition',
        old_value: before.status,
        new_value: `${nextStatus}|reason=${reason}`,
      });
    } else {
      const trigger = pickTrigger(patch);
      if (trigger) {
        nextStatus = deriveNextStatus(before.status, trigger);
        if (nextStatus !== before.status) {
          set['status'] = nextStatus;
          auditEntries.push({
            referral_id: id,
            changed_by: userId,
            field_changed: 'status_transition',
            old_value: before.status,
            new_value: nextStatus,
          });
        }
      }
    }

    // Field-level audit entries (diff between before and set, excluding status — already logged).
    for (const [k, v] of Object.entries(set)) {
      if (k === 'status') continue;
      const beforeVal = (before as unknown as Record<string, unknown>)[k];
      if (beforeVal === v) continue;
      auditEntries.push({
        referral_id: id,
        changed_by: userId,
        field_changed: k,
        old_value: beforeVal == null ? null : String(beforeVal),
        new_value: v == null ? null : String(v),
      });
    }

    if (Object.keys(set).length === 0) {
      return before;
    }

    const keys = Object.keys(set);
    const assigns = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map((k) => set[k]);
    const updateResult = await client.query(
      `UPDATE ministerial_referrals SET ${assigns} WHERE id = $1 RETURNING *`,
      [id, ...values],
    );
    const after = updateResult.rows[0] as Referral;

    await writeAuditEntriesTx(client, auditEntries);
    return after;
  });
}

/**
 * Append a timestamped note to minister_notes atomically. Avoids the
 * read-modify-write race that updateReferralFields would have if two
 * minister POSTs arrive in parallel.
 */
export async function appendMinisterNote(id: string, entry: string, userId: string): Promise<Referral> {
  rejectEmDash(entry, 'minister_notes');
  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT * FROM ministerial_referrals WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (lockResult.rowCount === 0) throw new Error('Referral not found');
    const before = lockResult.rows[0] as Referral;

    const updateResult = await client.query(
      `UPDATE ministerial_referrals
         SET minister_notes = CASE
               WHEN minister_notes IS NULL OR minister_notes = ''
                 THEN $2
               ELSE minister_notes || E'\n\n' || $2
             END
       WHERE id = $1
       RETURNING *`,
      [id, entry],
    );
    const after = updateResult.rows[0] as Referral;

    await writeAuditEntriesTx(client, [
      {
        referral_id: id,
        changed_by: userId,
        field_changed: 'minister_notes',
        old_value: before.minister_notes,
        new_value: after.minister_notes,
      },
    ]);
    return after;
  });
}

export async function deleteDraftReferral(id: string, _userId: string): Promise<void> {
  const { data, error: selectErr } = await supabaseAdmin
    .from('ministerial_referrals')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (selectErr) throw selectErr;
  if (!data) throw new Error('Referral not found');
  if (data.status !== 'drafted') {
    const err = new Error('Cannot delete a submitted referral. Close it with a reason instead.');
    (err as Error & { code?: string }).code = 'NOT_DRAFT';
    throw err;
  }
  const { error } = await supabaseAdmin.from('ministerial_referrals').delete().eq('id', id);
  if (error) throw error;
}

