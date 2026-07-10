// Direct Outreach — read/write queries over the synced OP Direct mirror
// (lib/db-pg). `agencyScope` restricts every query to one agency; the API layer
// passes the session agency for agency_manager users so scoping is enforced
// server-side. ALL agency semantics use effective_agency = COALESCE(transfer
// override, workbook agency) — computed in direct_outreach_open_v (migration
// 148); the two hand-inlined copies below (getSummary case-stats and getCase,
// which must include Resolved cases the view excludes) mirror it exactly.

import { query, transaction } from '@/lib/db-pg';
import { buildListFilterSql } from './filter-sql';
import type {
  OutreachAgencySummary,
  OutreachCaseDetail,
  OutreachCaseRow,
  OutreachCaseState,
  OutreachListFilters,
  OutreachOfficerLoad,
  OutreachOfficerUpdate,
  OutreachSummary,
  OutreachTransfer,
  OutreachUpdate,
  OutreachWorkingStatus,
} from './types';
import { OUTREACH_AGENCIES, OUTREACH_DEFAULT_SORT, OUTREACH_STALE_OFFICER_DAYS } from './types';

/** Hard cap on list responses; the API flags `truncated` when it is hit. */
export const LIST_LIMIT = 2000;

// Whitelisted sort fields → qualified columns (never interpolate user input).
// View v4 (migration 151) carries assignee/state/staleness, so everything but
// the assignee display name sorts on the view directly.
const SORT_COLUMNS: Record<string, string> = {
  case_id: 'v.case_id',
  agency: 'v.effective_agency',
  status: 'v.status',
  theme: 'v.theme',
  days_idle: 'v.days_idle',
  days_open: 'v.days_open',
  latest_update_date: 'v.latest_update_date',
  target_date: 'v.effective_target_date',
  assignee: 'au.name',
  working_status: 'v.working_status',
  officer_update: 'v.days_since_officer_action',
};

function pct(resolved: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((resolved / total) * 100);
}

// ── Summary ──────────────────────────────────────────────────────────────────

export async function getSummary(agencyScope?: string): Promise<OutreachSummary> {
  const scopeParams = agencyScope ? [agencyScope] : [];
  // Resolution stats must include Resolved cases, which the open view excludes,
  // so this query joins the overrides table directly — same COALESCE as the view.
  const caseScope = agencyScope ? 'AND upper(coalesce(o.agency, c.agency)) = $1' : '';
  const openScope = agencyScope ? 'AND upper(v.effective_agency) = $1' : '';

  const [caseStats, openStats, syncState, regionOpts, outreachOpts, officerOpts, officerLoad] =
    await Promise.all([
      query(
        `SELECT upper(coalesce(o.agency, c.agency)) AS agency,
                count(*)::int AS total,
                count(*) FILTER (WHERE c.status = 'Resolved')::int AS resolved
           FROM direct_outreach_cases c
           LEFT JOIN direct_outreach_agency_overrides o ON o.case_id = c.case_id
          WHERE coalesce(o.agency, c.agency) IS NOT NULL ${caseScope}
          GROUP BY upper(coalesce(o.agency, c.agency))`,
        scopeParams,
      ),
      // Q4: overdue/with_target follow the EFFECTIVE target (officer > heuristic).
      query(
        `SELECT upper(v.effective_agency) AS agency,
                count(*)::int AS open,
                count(*) FILTER (WHERE v.days_idle > 60)::int AS stalled_60,
                count(*) FILTER (WHERE v.days_idle > 90)::int AS stalled_90,
                count(*) FILTER (WHERE v.effective_target_overdue)::int AS overdue_commitments,
                count(*) FILTER (WHERE v.effective_target_date IS NOT NULL)::int AS with_target,
                count(*) FILTER (WHERE v.transferred)::int AS transferred_in,
                count(*) FILTER (WHERE v.assignee_user_id IS NULL)::int AS unassigned,
                count(*) FILTER (WHERE v.days_since_officer_action > ${OUTREACH_STALE_OFFICER_DAYS})::int AS stale_officer,
                count(*) FILTER (WHERE v.officer_target_overdue)::int AS officer_overdue
           FROM direct_outreach_open_v v
          WHERE v.effective_agency IS NOT NULL ${openScope}
          GROUP BY upper(v.effective_agency)`,
        scopeParams,
      ),
      query(
        `SELECT last_synced_at, cases_seen, updates_seen
           FROM direct_outreach_sync_state
          WHERE id = 1`,
      ),
      query(
        `SELECT DISTINCT v.region FROM direct_outreach_open_v v
          WHERE v.region IS NOT NULL ${openScope} ORDER BY v.region`,
        scopeParams,
      ),
      query(
        `SELECT DISTINCT v.outreach_location FROM direct_outreach_open_v v
          WHERE v.outreach_location IS NOT NULL ${openScope} ORDER BY v.outreach_location`,
        scopeParams,
      ),
      query(
        `SELECT DISTINCT au.id, au.name
           FROM direct_outreach_open_v v
           JOIN users au ON au.id = v.assignee_user_id
          WHERE true ${openScope}
          ORDER BY au.name NULLS LAST`,
        scopeParams,
      ),
      // Per-officer accountability rollup over assigned open cases; the
      // last-update column is strict per-author (their own posts only).
      query(
        `SELECT au.id, au.name, au.agency,
                count(*)::int AS open_cases,
                count(*) FILTER (WHERE v.days_since_officer_action > ${OUTREACH_STALE_OFFICER_DAYS})::int AS stale_cases,
                count(*) FILTER (WHERE v.officer_target_overdue)::int AS overdue_commitments,
                (SELECT max(u.created_at) FROM direct_outreach_officer_updates u
                  WHERE u.author_id = au.id) AS last_update_at
           FROM direct_outreach_open_v v
           JOIN users au ON au.id = v.assignee_user_id
          WHERE true ${openScope}
          GROUP BY au.id, au.name, au.agency
          ORDER BY stale_cases DESC, open_cases DESC, au.name NULLS LAST`,
        scopeParams,
      ),
    ]);

  const byAgency = new Map<string, OutreachAgencySummary>();
  const blank = (agency: string): OutreachAgencySummary => ({
    agency,
    total: 0,
    resolved: 0,
    open: 0,
    resolution_rate: null,
    stalled_60: 0,
    stalled_90: 0,
    overdue_commitments: 0,
    with_target: 0,
    transferred_in: 0,
    unassigned: 0,
    stale_officer: 0,
    officer_overdue: 0,
  });

  for (const row of caseStats.rows) {
    const entry = byAgency.get(row.agency) ?? blank(row.agency);
    entry.total = row.total;
    entry.resolved = row.resolved;
    entry.resolution_rate = pct(row.resolved, row.total);
    byAgency.set(row.agency, entry);
  }
  let unassignedOpen = 0;
  let staleOfficer = 0;
  let officerOverdue = 0;
  for (const row of openStats.rows) {
    const entry = byAgency.get(row.agency) ?? blank(row.agency);
    entry.open = row.open;
    entry.stalled_60 = row.stalled_60;
    entry.stalled_90 = row.stalled_90;
    entry.overdue_commitments = row.overdue_commitments;
    entry.with_target = row.with_target;
    entry.transferred_in = row.transferred_in;
    entry.unassigned = row.unassigned;
    entry.stale_officer = row.stale_officer;
    entry.officer_overdue = row.officer_overdue;
    unassignedOpen += row.unassigned;
    staleOfficer += row.stale_officer;
    officerOverdue += row.officer_overdue;
    byAgency.set(row.agency, entry);
  }

  // Stable ordering: known agencies first (GWI/GPL/PUA), then anything unexpected.
  const known = OUTREACH_AGENCIES.filter((a) => byAgency.has(a)).map((a) => byAgency.get(a)!);
  const rest = [...byAgency.values()]
    .filter((a) => !(OUTREACH_AGENCIES as readonly string[]).includes(a.agency))
    .sort((a, b) => a.agency.localeCompare(b.agency));
  const agencies = [...known, ...rest];

  const totals = agencies.reduce(
    (acc, a) => ({
      total: acc.total + a.total,
      resolved: acc.resolved + a.resolved,
      open: acc.open + a.open,
      resolution_rate: null,
      stalled_60: acc.stalled_60 + a.stalled_60,
      stalled_90: acc.stalled_90 + a.stalled_90,
      overdue_commitments: acc.overdue_commitments + a.overdue_commitments,
      with_target: acc.with_target + a.with_target,
      transferred_in: acc.transferred_in + a.transferred_in,
      unassigned_open: unassignedOpen,
      stale_officer: staleOfficer,
      officer_overdue: officerOverdue,
    }),
    {
      total: 0, resolved: 0, open: 0, resolution_rate: null as number | null,
      stalled_60: 0, stalled_90: 0, overdue_commitments: 0, with_target: 0,
      transferred_in: 0, unassigned_open: unassignedOpen,
      stale_officer: staleOfficer, officer_overdue: officerOverdue,
    },
  );
  totals.resolution_rate = pct(totals.resolved, totals.total);

  const sync = syncState.rows[0] ?? {};
  return {
    totals,
    agencies,
    officer_load: officerLoad.rows as OutreachOfficerLoad[],
    filter_options: {
      regions: regionOpts.rows.map((r) => r.region as string),
      outreach_locations: outreachOpts.rows.map((r) => r.outreach_location as string),
      officers: officerOpts.rows.map((r) => ({ id: r.id as string, name: (r.name as string) ?? null })),
    },
    last_synced_at: sync.last_synced_at ?? null,
    // Ministry-wide sync counters stay superadmin-only (scoped view gets nulls).
    cases_seen: agencyScope ? null : (sync.cases_seen ?? null),
    updates_seen: agencyScope ? null : (sync.updates_seen ?? null),
  };
}

// ── Open-case list ───────────────────────────────────────────────────────────

export async function getOpenCases(
  filters: OutreachListFilters,
  agencyScope?: string,
  requesterId?: string,
): Promise<OutreachCaseRow[]> {
  const { where, params } = buildListFilterSql(filters, agencyScope, requesterId);

  const sortKey = filters.sort ?? OUTREACH_DEFAULT_SORT;
  const sortCol = Object.hasOwn(SORT_COLUMNS, sortKey)
    ? SORT_COLUMNS[sortKey]
    : SORT_COLUMNS[OUTREACH_DEFAULT_SORT];
  const sortDir = filters.sort_dir === 'asc' ? 'ASC' : 'DESC';
  // Q6: days_since_officer_action treats NULL as +infinity — "never touched"
  // is MOST neglected, so DESC puts NULLs first and ASC puts them last.
  // Every other sort keeps the original NULLS LAST.
  const nulls =
    sortCol === SORT_COLUMNS.officer_update
      ? sortDir === 'DESC' ? 'NULLS FIRST' : 'NULLS LAST'
      : 'NULLS LAST';

  const result = await query(
    `SELECT v.case_id, v.client_name, v.client_address,
            v.agency, v.effective_agency, v.transferred,
            v.status, v.priority_flag, v.theme,
            v.description, v.category_name, v.outreach_location, v.outreach_date,
            v.region, v.point_person, v.created_at,
            v.assignee_user_id, au.name AS assignee_name, v.assigned_at,
            v.latest_update, v.latest_update_date, v.latest_update_by, v.comment_count,
            v.days_open, v.days_idle, v.age_bucket,
            v.committed_date::text AS committed_date, v.committed_source, v.committed_by,
            v.committed_overdue,
            v.working_status,
            v.officer_target_date::text AS officer_target_date, v.officer_target_overdue,
            v.effective_target_date::text AS effective_target_date, v.effective_target_overdue,
            v.last_officer_update_at, v.days_since_officer_action
       FROM direct_outreach_open_v v
       LEFT JOIN users au ON au.id = v.assignee_user_id
       ${where}
      ORDER BY ${sortCol} ${sortDir} ${nulls}, v.case_id ASC
      LIMIT ${LIST_LIMIT}`,
    params,
  );

  return result.rows as OutreachCaseRow[];
}

// ── Single case + imported history + transfer audit ─────────────────────────

export async function getCase(
  caseId: number,
  agencyScope?: string,
  requesterId?: string,
): Promise<{
  case: OutreachCaseDetail;
  updates: OutreachUpdate[];
  transfers: OutreachTransfer[];
  officer_updates: OutreachOfficerUpdate[];
  state: OutreachCaseState;
} | null> {
  const params: unknown[] = [caseId];
  let scopeClause = '';
  if (agencyScope) {
    params.push(agencyScope);
    // Ownership follows the transfer override — same COALESCE as the view.
    // The requester-identity branch lets the ASSIGNED responsible officer open
    // their own case even when its effective agency is not theirs (e.g. a
    // superadmin assigned a cross-agency officer) — without it the assignee
    // 404s on the very case they must work. Anyone else outside the agency
    // still gets the opaque 404 (locked Q-spec).
    if (requesterId) {
      params.push(requesterId);
      scopeClause = 'AND (upper(coalesce(o.agency, c.agency)) = $2 OR a.assignee_user_id = $3::uuid)';
    } else {
      scopeClause = 'AND upper(coalesce(o.agency, c.agency)) = $2';
    }
  }

  // Same aging/state expressions as direct_outreach_open_v (Guyana calendar
  // day, NULL-safe bucket), inlined so Resolved cases — which the view
  // excludes — still render in the detail panel.
  const caseResult = await query(
    `SELECT c.*,
            c.committed_date::text AS committed_date,
            coalesce(o.agency, c.agency) AS effective_agency,
            (o.agency IS NOT NULL AND o.agency IS DISTINCT FROM c.agency) AS transferred,
            a.assignee_user_id, au.name AS assignee_name, au.agency AS assignee_agency,
            a.assigned_at,
            coalesce(s.working_status, 'not_started') AS working_status,
            s.target_date::text AS officer_target_date,
            (s.target_date IS NOT NULL
               AND s.target_date < (now() AT TIME ZONE 'America/Guyana')::date) AS officer_target_overdue,
            coalesce(s.target_date, c.committed_date)::text AS effective_target_date,
            (coalesce(s.target_date, c.committed_date) IS NOT NULL
               AND coalesce(s.target_date, c.committed_date)
                   < (now() AT TIME ZONE 'America/Guyana')::date) AS effective_target_overdue,
            s.updated_by AS state_updated_by, su.name AS state_updated_by_name,
            s.updated_at AS state_updated_at,
            ou.last_officer_update_at,
            ((now() AT TIME ZONE 'America/Guyana')::date
               - (greatest(ou.last_officer_update_at, a.assigned_at)
                    AT TIME ZONE 'America/Guyana')::date) AS days_since_officer_action,
            ((now() AT TIME ZONE 'America/Guyana')::date
               - (c.created_at AT TIME ZONE 'America/Guyana')::date) AS days_open,
            ((now() AT TIME ZONE 'America/Guyana')::date
               - (coalesce(c.last_activity_at, c.created_at) AT TIME ZONE 'America/Guyana')::date) AS days_idle,
            CASE
              WHEN c.created_at IS NULL THEN 'Unknown'
              WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 30  THEN '0-30'
              WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 90  THEN '31-90'
              WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 180 THEN '91-180'
              WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 365 THEN '181-365'
              ELSE 'Over 365'
            END AS age_bucket,
            (c.committed_date IS NOT NULL
               AND c.committed_date < (now() AT TIME ZONE 'America/Guyana')::date) AS committed_overdue
       FROM direct_outreach_cases c
       LEFT JOIN direct_outreach_agency_overrides o ON o.case_id = c.case_id
       LEFT JOIN direct_outreach_assignments a ON a.case_id = c.case_id
       LEFT JOIN direct_outreach_case_state s ON s.case_id = c.case_id
       LEFT JOIN users au ON au.id = a.assignee_user_id
       LEFT JOIN users su ON su.id = s.updated_by
       LEFT JOIN LATERAL (
         SELECT max(u.created_at) AS last_officer_update_at
           FROM direct_outreach_officer_updates u
          WHERE u.case_id = c.case_id
       ) ou ON true
      WHERE c.case_id = $1 ${scopeClause}`,
    params,
  );

  if (caseResult.rows.length === 0) return null;

  const [updatesResult, transfersResult, officerUpdates] = await Promise.all([
    query(
      `SELECT entry_ref, case_id, agency, creator_agency, status, comment, username, created_at
         FROM direct_outreach_updates
        WHERE case_id = $1
        ORDER BY created_at DESC NULLS LAST, entry_ref DESC`,
      [caseId],
    ),
    query(
      `SELECT t.id, t.case_id, t.from_agency, t.to_agency, t.cleared_assignee_user_id,
              t.reason, t.transferred_by, tu.name AS transferred_by_name, t.transferred_at
         FROM direct_outreach_transfers t
         LEFT JOIN users tu ON tu.id = t.transferred_by
        WHERE t.case_id = $1
        ORDER BY t.transferred_at DESC`,
      [caseId],
    ),
    getOfficerUpdates(caseId),
  ]);

  const row = caseResult.rows[0] as OutreachCaseDetail & {
    state_updated_by: string | null;
    state_updated_by_name: string | null;
    state_updated_at: string | null;
  };
  const { state_updated_by, state_updated_by_name, state_updated_at, ...caseDetail } = row;

  return {
    case: caseDetail as OutreachCaseDetail,
    updates: updatesResult.rows as OutreachUpdate[],
    transfers: transfersResult.rows as OutreachTransfer[],
    officer_updates: officerUpdates,
    state: {
      working_status: caseDetail.working_status,
      target_date: caseDetail.officer_target_date,
      updated_by: state_updated_by,
      updated_by_name: state_updated_by_name,
      updated_at: state_updated_at,
    },
  };
}

/** Officer progress log for one case, newest first (author joined at read time). */
export async function getOfficerUpdates(caseId: number): Promise<OutreachOfficerUpdate[]> {
  const result = await query(
    `SELECT u.id, u.case_id, u.author_id, au.name AS author_name, au.agency AS author_agency,
            u.body, u.new_working_status, u.new_target_date::text AS new_target_date,
            u.target_cleared, u.created_at
       FROM direct_outreach_officer_updates u
       LEFT JOIN users au ON au.id = u.author_id
      WHERE u.case_id = $1
      ORDER BY u.created_at DESC, u.id DESC`,
    [caseId],
  );
  return result.rows as OutreachOfficerUpdate[];
}

// ── Assignment writes ────────────────────────────────────────────────────────

export async function getUserForAssignment(
  userId: string,
): Promise<{ id: string; name: string | null; role: string | null; agency: string | null; is_active: boolean } | null> {
  const result = await query(
    `SELECT id, name, role, agency, is_active FROM users WHERE id = $1::uuid`,
    [userId],
  );
  return (result.rows[0] as { id: string; name: string | null; role: string | null; agency: string | null; is_active: boolean }) ?? null;
}

/**
 * Every ACTIVE human user in the system — the superadmin assignment picker
 * (a superadmin may assign ANY human as responsible officer, regardless of
 * agency or role). Driven entirely off the users table: no agency allowlist,
 * no OUTREACH_AGENCIES. The only exclusions are non-humans (role = 'system'
 * is the users table's sole service-account marker — verified: no
 * is_service/is_bot/type column exists) and deactivated accounts (they cannot
 * log in to work a case, and setAssignee's validator rejects them anyway).
 */
export async function getAssignableOfficers(): Promise<
  { id: string; name: string | null; role: string; agency: string | null }[]
> {
  const result = await query(
    `SELECT id, name, role, agency FROM users
      WHERE is_active AND role <> 'system'
      ORDER BY name NULLS LAST, id`,
  );
  return result.rows as { id: string; name: string | null; role: string; agency: string | null }[];
}

/**
 * Guarded upsert: the INSERT..SELECT re-checks the case's CURRENT effective
 * agency in the same statement, so a transfer committing between the route's
 * permission check and this write makes it a no-op instead of stranding an
 * officer on a case their agency no longer owns. Returns false when the guard
 * failed (ownership changed concurrently) — the route surfaces a 409.
 */
export async function setAssignee(
  caseId: number,
  assigneeUserId: string,
  byUserId: string,
  expectedEffectiveAgency: string | null,
): Promise<boolean> {
  const result = await query(
    `INSERT INTO direct_outreach_assignments (case_id, assignee_user_id, assigned_by, assigned_at)
     SELECT c.case_id, $2::uuid, $3::uuid, now()
       FROM direct_outreach_cases c
       LEFT JOIN direct_outreach_agency_overrides o ON o.case_id = c.case_id
      WHERE c.case_id = $1
        AND upper(coalesce(o.agency, c.agency)) IS NOT DISTINCT FROM upper($4::text)
     ON CONFLICT (case_id) DO UPDATE SET
       assignee_user_id = EXCLUDED.assignee_user_id,
       assigned_by = EXCLUDED.assigned_by,
       assigned_at = now()`,
    [caseId, assigneeUserId, byUserId, expectedEffectiveAgency],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function clearAssignee(caseId: number): Promise<void> {
  await query(`DELETE FROM direct_outreach_assignments WHERE case_id = $1`, [caseId]);
}

// ── Officer progress updates (v3 — append-only, Q5) ─────────────────────────

export interface OfficerUpdateInput {
  caseId: number;
  authorId: string;
  /** Remark text in raw @[uuid] mention format; null when state-change only. */
  body: string | null;
  /** null = untouched. */
  workingStatus: OutreachWorkingStatus | null;
  /** undefined = untouched, null = clear, string (YYYY-MM-DD) = set. */
  targetDate: string | null | undefined;
}

/**
 * Append one log row and (when the row carries a state change) upsert the
 * current-state row IN THE SAME TRANSACTION, so state and history can never
 * disagree. There is deliberately no update/delete counterpart (Q5).
 */
export async function insertOfficerUpdate(input: OfficerUpdateInput): Promise<OutreachOfficerUpdate> {
  const { caseId, authorId, body, workingStatus, targetDate } = input;
  const touchTarget = targetDate !== undefined;

  const inserted = await transaction(async (client) => {
    const row = await client.query(
      `INSERT INTO direct_outreach_officer_updates
         (case_id, author_id, body, new_working_status, new_target_date, target_cleared)
       VALUES ($1, $2::uuid, $3, $4, $5::date, $6)
       RETURNING id, case_id, author_id, body, new_working_status,
                 new_target_date::text AS new_target_date, target_cleared, created_at`,
      [caseId, authorId, body, workingStatus, targetDate ?? null, targetDate === null],
    );

    if (workingStatus !== null || touchTarget) {
      // Partial upsert: only the touched half changes; the other half keeps
      // its current value ($5 gates the target write so "status only" cannot
      // clobber an existing target date, and vice versa).
      await client.query(
        `INSERT INTO direct_outreach_case_state AS s
           (case_id, working_status, target_date, updated_by)
         VALUES ($1, coalesce($2, 'not_started'), CASE WHEN $5 THEN $3::date ELSE NULL END, $4::uuid)
         ON CONFLICT (case_id) DO UPDATE SET
           working_status = coalesce($2, s.working_status),
           target_date    = CASE WHEN $5 THEN $3::date ELSE s.target_date END,
           updated_by     = $4::uuid,
           updated_at     = now()`,
        [caseId, workingStatus, targetDate ?? null, authorId, touchTarget],
      );
    }

    return row.rows[0] as OutreachOfficerUpdate;
  });

  return inserted;
}

/**
 * Mention scope guard: of the @-mentioned user ids, keep only active users who
 * can actually SEE the case (superadmins, managers of its effective agency, or
 * the case's ASSIGNED officer — who can open it cross-agency via getCase's
 * identity clause) — so nobody is notified into a case that 404s for them.
 */
export async function filterMentionableUsers(
  userIds: string[],
  effectiveAgency: string | null,
  assigneeUserId?: string | null,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const result = await query(
    `SELECT id FROM users
      WHERE id = ANY($1::uuid[])
        AND is_active
        AND (role = 'superadmin'
             OR (role = 'agency_manager' AND upper(agency) = upper($2::text))
             OR id = $3::uuid)`,
    [userIds, effectiveAgency, assigneeUserId ?? null],
  );
  return (result.rows as { id: string }[]).map((r) => r.id);
}

// ── Transfer (superadmin) ────────────────────────────────────────────────────

export type TransferResult =
  | { ok: true; fromAgency: string | null; clearedAssigneeUserId: string | null }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'noop'; agency: string | null };

/**
 * Fully serialized transfer: the case row is locked FOR UPDATE first, so
 * concurrent transfers of the same case queue behind each other and each one
 * recomputes from_agency and the no-op guard against COMMITTED state — the
 * audit chain always reconstructs the true sequence (plan §3.3 step 1).
 * Then: upsert the override (or delete it when transferring back to the
 * workbook agency), clear the officer (captured for the audit row first),
 * and append the audit row.
 */
export async function executeTransfer(input: {
  caseId: number;
  toAgency: string;
  reason: string;
  byUserId: string;
}): Promise<TransferResult> {
  const { caseId, toAgency, reason, byUserId } = input;

  return transaction(async (client): Promise<TransferResult> => {
    // Lock the case row — the serialization point for all transfers of this
    // case (the overrides row may not exist yet, so it can't be the lock).
    const caseRow = await client.query(
      `SELECT c.agency AS workbook_agency, coalesce(o.agency, c.agency) AS effective_agency
         FROM direct_outreach_cases c
         LEFT JOIN direct_outreach_agency_overrides o ON o.case_id = c.case_id
        WHERE c.case_id = $1
        FOR UPDATE OF c`,
      [caseId],
    );
    if (caseRow.rows.length === 0) return { ok: false, reason: 'not_found' };
    const workbookAgency: string | null = caseRow.rows[0].workbook_agency;
    const fromAgency: string | null = caseRow.rows[0].effective_agency;

    // No-op guard INSIDE the lock, against committed state.
    if (fromAgency && toAgency.toUpperCase() === fromAgency.toUpperCase()) {
      return { ok: false, reason: 'noop', agency: fromAgency };
    }

    const current = await client.query(
      `SELECT assignee_user_id FROM direct_outreach_assignments WHERE case_id = $1 FOR UPDATE`,
      [caseId],
    );
    const clearedAssigneeUserId: string | null = current.rows[0]?.assignee_user_id ?? null;

    if (workbookAgency && toAgency.toUpperCase() === workbookAgency.toUpperCase()) {
      // Revert: back to the workbook agency — drop the override entirely.
      await client.query(`DELETE FROM direct_outreach_agency_overrides WHERE case_id = $1`, [caseId]);
    } else {
      await client.query(
        `INSERT INTO direct_outreach_agency_overrides (case_id, agency, set_by, set_at)
         VALUES ($1, $2, $3::uuid, now())
         ON CONFLICT (case_id) DO UPDATE SET
           agency = EXCLUDED.agency, set_by = EXCLUDED.set_by, set_at = now()`,
        [caseId, toAgency, byUserId],
      );
    }

    await client.query(`DELETE FROM direct_outreach_assignments WHERE case_id = $1`, [caseId]);

    await client.query(
      `INSERT INTO direct_outreach_transfers
         (case_id, from_agency, to_agency, cleared_assignee_user_id, reason, transferred_by)
       VALUES ($1, $2, $3, $4::uuid, $5, $6::uuid)`,
      [caseId, fromAgency, toAgency, clearedAssigneeUserId, reason, byUserId],
    );

    return { ok: true, fromAgency, clearedAssigneeUserId };
  });
}

/** Active recipients for a transfer notification: the receiving agency's managers (PUA → superadmins). */
export async function getTransferNotificationRecipients(
  toAgency: string,
): Promise<{ id: string; name: string | null }[]> {
  const result = await query(
    `SELECT id, name FROM users
      WHERE is_active
        AND ((role = 'agency_manager' AND upper(agency) = upper($1))
             OR (upper($1) = 'PUA' AND role = 'superadmin'))`,
    [toAgency],
  );
  return result.rows as { id: string; name: string | null }[];
}
