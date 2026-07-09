// Direct Outreach — read queries over the synced OP Direct mirror (lib/db-pg).
// `agencyScope` restricts every query to one agency; the API layer passes the
// session agency for agency_manager users so scoping is enforced server-side.

import { query } from '@/lib/db-pg';
import type {
  OutreachAgencySummary,
  OutreachCaseDetail,
  OutreachCaseRow,
  OutreachListFilters,
  OutreachSummary,
  OutreachUpdate,
} from './types';
import { OUTREACH_AGENCIES } from './types';

/** Hard cap on list responses; the API flags `truncated` when it is hit. */
export const LIST_LIMIT = 2000;

// Whitelisted sort fields → view columns (never interpolate user input directly).
const SORT_COLUMNS: Record<string, string> = {
  case_id: 'case_id',
  agency: 'agency',
  status: 'status',
  theme: 'theme',
  days_idle: 'days_idle',
  days_open: 'days_open',
  latest_update_date: 'latest_update_date',
  committed_date: 'committed_date',
};

function pct(resolved: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((resolved / total) * 100);
}

// ── Summary ──────────────────────────────────────────────────────────────────

export async function getSummary(agencyScope?: string): Promise<OutreachSummary> {
  const scopeParams = agencyScope ? [agencyScope] : [];
  const caseScope = agencyScope ? 'AND upper(agency) = $1' : '';

  const [caseStats, openStats, syncState] = await Promise.all([
    query(
      `SELECT upper(agency) AS agency,
              count(*)::int AS total,
              count(*) FILTER (WHERE status = 'Resolved')::int AS resolved
         FROM direct_outreach_cases
        WHERE agency IS NOT NULL ${caseScope}
        GROUP BY upper(agency)`,
      scopeParams,
    ),
    query(
      `SELECT upper(agency) AS agency,
              count(*)::int AS open,
              count(*) FILTER (WHERE days_idle > 60)::int AS stalled_60,
              count(*) FILTER (WHERE days_idle > 90)::int AS stalled_90,
              count(*) FILTER (WHERE committed_overdue)::int AS overdue_commitments,
              count(*) FILTER (WHERE committed_date IS NOT NULL)::int AS with_target
         FROM direct_outreach_open_v
        WHERE agency IS NOT NULL ${caseScope}
        GROUP BY upper(agency)`,
      scopeParams,
    ),
    query(
      `SELECT last_synced_at, cases_seen, updates_seen
         FROM direct_outreach_sync_state
        WHERE id = 1`,
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
  });

  for (const row of caseStats.rows) {
    const entry = byAgency.get(row.agency) ?? blank(row.agency);
    entry.total = row.total;
    entry.resolved = row.resolved;
    entry.resolution_rate = pct(row.resolved, row.total);
    byAgency.set(row.agency, entry);
  }
  for (const row of openStats.rows) {
    const entry = byAgency.get(row.agency) ?? blank(row.agency);
    entry.open = row.open;
    entry.stalled_60 = row.stalled_60;
    entry.stalled_90 = row.stalled_90;
    entry.overdue_commitments = row.overdue_commitments;
    entry.with_target = row.with_target;
    byAgency.set(row.agency, entry);
  }

  // Stable ordering: known agencies first (GWI/GPL/PUA), then anything unexpected.
  const known = OUTREACH_AGENCIES.filter((a) => byAgency.has(a)).map((a) => byAgency.get(a)!);
  const rest = [...byAgency.values()]
    .filter((a) => !(OUTREACH_AGENCIES as string[]).includes(a.agency))
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
    }),
    { total: 0, resolved: 0, open: 0, resolution_rate: null as number | null, stalled_60: 0, stalled_90: 0, overdue_commitments: 0, with_target: 0 },
  );
  totals.resolution_rate = pct(totals.resolved, totals.total);

  const sync = syncState.rows[0] ?? {};
  return {
    totals,
    agencies,
    last_synced_at: sync.last_synced_at ?? null,
    // The sync counters are ministry-wide; expose them only to the unscoped
    // (superadmin) view so a scoped agency_manager can't read global volume.
    cases_seen: agencyScope ? null : (sync.cases_seen ?? null),
    updates_seen: agencyScope ? null : (sync.updates_seen ?? null),
  };
}

// ── Open-case list ───────────────────────────────────────────────────────────

export async function getOpenCases(
  filters: OutreachListFilters,
  agencyScope?: string,
): Promise<OutreachCaseRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    conditions.push(clause.replace('?', `$${params.length}`));
  };

  if (agencyScope) add('upper(agency) = ?', agencyScope);
  if (filters.agency) add('upper(agency) = ?', filters.agency.toUpperCase());
  if (filters.status) add('status = ?', filters.status);
  if (filters.theme) add('theme = ?', filters.theme);

  switch (filters.backlog) {
    case 'stalled60':
      conditions.push('days_idle > 60');
      break;
    case 'stalled90':
      conditions.push('days_idle > 90');
      break;
    case 'target':
      conditions.push('committed_date IS NOT NULL');
      break;
    case 'overdue':
      conditions.push('committed_overdue');
      break;
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(case_id::text ILIKE ${p} OR client_name ILIKE ${p} OR client_address ILIKE ${p}
        OR description ILIKE ${p} OR outreach_location ILIKE ${p} OR latest_update ILIKE ${p})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // Object.hasOwn: a bare bracket lookup would resolve Object.prototype keys
  // (?sort=constructor) to a truthy non-column value and break the ORDER BY.
  const sortKey = filters.sort ?? '';
  const sortCol = Object.hasOwn(SORT_COLUMNS, sortKey) ? SORT_COLUMNS[sortKey] : 'days_idle';
  const sortDir = filters.sort_dir === 'asc' ? 'ASC' : 'DESC';

  const result = await query(
    `SELECT case_id, client_name, client_address, agency, status, priority_flag, theme,
            description, category_name, outreach_location, outreach_date, created_at,
            latest_update, latest_update_date, latest_update_by, comment_count,
            days_open, days_idle, age_bucket,
            committed_date::text AS committed_date, committed_source, committed_by, committed_overdue
       FROM direct_outreach_open_v
       ${where}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST, case_id ASC
      LIMIT ${LIST_LIMIT}`,
    params,
  );

  return result.rows as OutreachCaseRow[];
}

// ── Single case + imported history ───────────────────────────────────────────

export async function getCase(
  caseId: number,
  agencyScope?: string,
): Promise<{ case: OutreachCaseDetail; updates: OutreachUpdate[] } | null> {
  const params: unknown[] = [caseId];
  let scopeClause = '';
  if (agencyScope) {
    params.push(agencyScope);
    scopeClause = 'AND upper(c.agency) = $2';
  }

  // Same aging expressions as direct_outreach_open_v (migration 145: Guyana
  // calendar day, NULL-safe bucket), inlined so Resolved cases — which the view
  // excludes — still render in the detail panel.
  const caseResult = await query(
    `SELECT c.*,
            c.committed_date::text AS committed_date,
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
      WHERE c.case_id = $1 ${scopeClause}`,
    params,
  );

  if (caseResult.rows.length === 0) return null;

  const updatesResult = await query(
    `SELECT entry_ref, case_id, agency, creator_agency, status, comment, username, created_at
       FROM direct_outreach_updates
      WHERE case_id = $1
      ORDER BY created_at DESC NULLS LAST, entry_ref DESC`,
    [caseId],
  );

  return {
    case: caseResult.rows[0] as OutreachCaseDetail,
    updates: updatesResult.rows as OutreachUpdate[],
  };
}
