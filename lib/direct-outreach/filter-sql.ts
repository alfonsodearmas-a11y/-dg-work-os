// Direct Outreach — pure WHERE-clause builder for the open-cases list.
// Extracted from queries.ts so the filter/param math is unit-testable without a
// database. Table alias fixed by the caller's FROM clause:
//   v = direct_outreach_open_v (view v4 carries assignee/state/staleness — the
//       old doa assignments join is gone as of migration 151)
//
// Multi-value filters use the repo's raw-SQL precedent `col = ANY($n::text[])`
// (node-postgres serializes JS arrays to PG arrays) — never expanded IN lists.
// The session-derived agency scope is ALWAYS the first condition; user filters
// are additional ANDs, so they can narrow but never widen a manager's scope.

import type { OutreachListFilters } from './types';
import { OUTREACH_STALE_OFFICER_DAYS, UNASSIGNED_OFFICER } from './types';

export interface FilterSql {
  /** '' or 'WHERE ...' */
  where: string;
  params: unknown[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildListFilterSql(
  filters: OutreachListFilters,
  agencyScope?: string,
): FilterSql {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const p = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  // Scope first — the security boundary (session-derived, never user input).
  if (agencyScope) {
    conditions.push(`upper(v.effective_agency) = ${p(agencyScope.toUpperCase())}`);
  }

  if (filters.agencies?.length) {
    conditions.push(
      `upper(v.effective_agency) = ANY(${p(filters.agencies.map((a) => a.toUpperCase()))}::text[])`,
    );
  }
  if (filters.statuses?.length) {
    conditions.push(`v.status = ANY(${p(filters.statuses)}::text[])`);
  }
  if (filters.themes?.length) {
    conditions.push(`v.theme = ANY(${p(filters.themes)}::text[])`);
  }
  if (filters.outreaches?.length) {
    conditions.push(`v.outreach_location = ANY(${p(filters.outreaches)}::text[])`);
  }
  if (filters.regions?.length) {
    conditions.push(`v.region = ANY(${p(filters.regions)}::text[])`);
  }
  if (filters.workingStatuses?.length) {
    conditions.push(`v.working_status = ANY(${p(filters.workingStatuses)}::text[])`);
  }

  // Officer multi-select: uuids and/or the 'unassigned' sentinel, OR-combined
  // within the filter (a case matches any selected officer or unassignedness).
  // Non-uuid junk is dropped here — it would otherwise blow up the strict
  // ::uuid[] cast and turn a garbage query param into a 500.
  if (filters.officers?.length) {
    const uuids = filters.officers.filter((o) => o !== UNASSIGNED_OFFICER && UUID_RE.test(o));
    const wantUnassigned = filters.officers.includes(UNASSIGNED_OFFICER);
    const parts: string[] = [];
    if (uuids.length) parts.push(`v.assignee_user_id = ANY(${p(uuids)}::uuid[])`);
    if (wantUnassigned) parts.push('v.assignee_user_id IS NULL');
    if (parts.length === 1) conditions.push(parts[0]);
    else if (parts.length > 1) conditions.push(`(${parts.join(' OR ')})`);
    // all values were junk → no condition at all
  }

  if (filters.assignedToMe) {
    conditions.push(`v.assignee_user_id = ${p(filters.assignedToMe)}::uuid`);
  }

  // Independent toggles — plain AND predicates.
  if (filters.highPriority) conditions.push(`v.priority_flag = 'Elevated'`);
  if (filters.stalled60) conditions.push('v.days_idle > 60');
  if (filters.stalled90) conditions.push('v.days_idle > 90');
  // Q4: target/overdue follow the EFFECTIVE target (officer date > heuristic).
  if (filters.hasTarget) conditions.push('v.effective_target_date IS NOT NULL');
  if (filters.overdue) conditions.push('v.effective_target_overdue');
  // NULL days_since_officer_action (unassigned & untouched) is deliberately
  // excluded — those cases are caught by the unassigned officer filter/flag.
  if (filters.staleOfficer) {
    conditions.push(`v.days_since_officer_action > ${OUTREACH_STALE_OFFICER_DAYS}`);
  }
  if (filters.officerOverdue) conditions.push('v.officer_target_overdue');

  if (filters.search) {
    const ph = p(`%${filters.search}%`);
    conditions.push(
      `(v.case_id::text ILIKE ${ph} OR v.client_name ILIKE ${ph} OR v.client_address ILIKE ${ph}
        OR v.description ILIKE ${ph} OR v.outreach_location ILIKE ${ph} OR v.latest_update ILIKE ${ph})`,
    );
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}
