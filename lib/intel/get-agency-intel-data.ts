import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getProjects } from '@/lib/delayed-projects/queries';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import {
  getCriticalTendersForAgency,
  getEvaluationTendersForAgency,
  type CriticalTenderRow,
  type EvaluationTenderRow,
} from '@/lib/procurement/queries';
import { classifyStation, deratedPct, type StationStatus } from '@/lib/gpl/derated';
import { INTEL_AGENCIES } from '@/lib/agencies';

/**
 * Single source of truth for what the agency-intel surface contains.
 *
 * Both the page-API route (app/api/intel/[agency]/route.ts) and the
 * report-API route (app/api/intel/[agency]/report/route.ts) call this —
 * never via internal HTTP, always direct.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgencyOpenTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  is_overdue: boolean;
}

export interface AgencyOutstandingApplications {
  total: number;
  by_status: Record<string, number>;
  by_age_bucket: {
    '0_30': number;
    '31_60': number;
    '61_90': number;
    '90_plus': number;
  };
  oldest_days: number | null;
}

export interface StationHealthRow {
  station: string;
  report_date: string;
  total_derated_capacity_mw: number | null;
  total_available_mw: number | null;
  pct_of_derated: number | null;
  status: StationStatus | 'unknown';
}

export interface RecentOutageRow {
  id: string;
  feeder_code: string | null;
  substation_code: string | null;
  areas_affected: string | null;
  date: string | null;
  time_out: string | null;
  duration_minutes: number | null;
  customers_affected: number | null;
  status: string | null;
}

export interface ReliabilityWindow {
  outage_count: number;
  customer_hours_lost: number;
  saidi_minutes: number | null;
  saifi: number | null;
}

export interface GridReliability {
  total_customers_served: number;
  feeder_count: number;
  // Latest synced_at across all rows in gpl_feeder_cache; null if cache is
  // empty. Days computed as floor((now - last_sync) / 86_400_000).
  feeder_last_sync: string | null;
  feeder_days_stale: number | null;
  // Human-readable label for the comparator window, e.g. "vs Apr 1–8 MTD" or
  // "vs Apr 1–30 (clamped)" when prior month is shorter than the current
  // day-of-month. Card renders this verbatim under the metric tiles.
  comparator_label: string;
  mtd: ReliabilityWindow;
  prior_month: ReliabilityWindow;
  delta: {
    outage_count_pct: number | null;
    customer_hours_lost_pct: number | null;
    saidi_pct: number | null;
    saifi_pct: number | null;
  };
}

export interface AirstripOpsRow {
  id: string;
  name: string;
  region: number;
  surface_condition: string | null;
  status: string;
  last_inspection_date: string | null;
  days_since_inspection: number | null;
}

export interface HasAirstripOps {
  total: number;
  operational: number;
  limited_or_rehab: number;
  closed: number;
  overdue_inspection: number;
  pending_verification: number;
  // Sorted: never-inspected first, then oldest inspection first.
  overdue: AirstripOpsRow[];
}

export interface ApplicationThroughput {
  // Closed in the last 30 days (approved | rejected).
  closed_30d: number;
  submitted_30d: number;
  // Average days from submission → closure for the closed_30d bucket.
  avg_days_to_close: number | null;
  // Open backlog now vs 30 days ago — positive = growing.
  backlog_now: number;
  backlog_change_30d: number;
  approval_rate_pct: number | null;
}

export interface AgencyIntelData {
  agency: string;
  generated_at: string;

  open_tasks: AgencyOpenTask[];
  delayed_projects: DelayedProjectWithComputed[];
  critical_procurement: CriticalTenderRow[];
  evaluation_tenders: EvaluationTenderRow[];

  // Metadata about the agency head — surface in PDF + UI footer.
  agency_head: {
    name: string | null;
    email: string | null;
    focal_point_name: string | null;
    focal_point_email: string | null;
  };

  // GPL-only extras. Undefined for other agencies.
  gpl?: {
    outstanding_applications: AgencyOutstandingApplications;
    station_health: StationHealthRow[];
    recent_outages: RecentOutageRow[];
    outage_count_mtd: number;
    grid_reliability: GridReliability;
    application_throughput: ApplicationThroughput;
  };

  // HAS-only extras. Undefined for other agencies.
  has?: {
    airstrip_ops: HasAirstripOps;
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const OPEN_STATUSES = ['new', 'active', 'blocked'];

async function getOpenTasksForAgency(agency: string): Promise<AgencyOpenTask[]> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select(
      'id, title, status, priority, due_date, owner_user_id, owner:users!owner_user_id(id, name)',
    )
    .ilike('agency', agency)
    .in('status', OPEN_STATUSES)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    logger.error({ err: error, agency }, 'getOpenTasksForAgency: query failed');
    return [];
  }

  const today = new Date().toISOString().slice(0, 10);
  return (data ?? []).map((row: Record<string, unknown>) => {
    // Supabase returns related rows as array even for single FK joins.
    const ownerVal = row.owner as
      | { id: string; name: string | null }
      | { id: string; name: string | null }[]
      | null
      | undefined;
    const owner = Array.isArray(ownerVal) ? ownerVal[0] ?? null : ownerVal ?? null;
    return {
      id: row.id as string,
      title: (row.title as string) ?? '',
      status: row.status as string,
      priority: (row.priority as string | null) ?? null,
      due_date: (row.due_date as string | null) ?? null,
      owner_user_id: (row.owner_user_id as string | null) ?? null,
      owner_name: owner?.name ?? null,
      is_overdue: !!row.due_date && (row.due_date as string) < today,
    };
  });
}

// ---------------------------------------------------------------------------
// Agency head / focal point
// ---------------------------------------------------------------------------

async function getAgencyHead(agency: string): Promise<AgencyIntelData['agency_head']> {
  const { data } = await supabaseAdmin
    .from('agency_psip_focal_point')
    .select('agency_head_name, agency_head_email, focal_point_name, focal_point_email')
    .eq('agency', agency.toUpperCase())
    .maybeSingle();

  // Strip seed placeholders so they never reach the UI. Real assignments
  // flow through unchanged.
  return {
    name: stripPlaceholder(data?.agency_head_name),
    email: data?.agency_head_email ?? null,
    focal_point_name: stripPlaceholder(data?.focal_point_name),
    focal_point_email: data?.focal_point_email ?? null,
  };
}

function stripPlaceholder(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().includes('(placeholder)')) return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// GPL-only extras
// ---------------------------------------------------------------------------

async function getOutstandingApplications(): Promise<AgencyOutstandingApplications> {
  const { data, error } = await supabaseAdmin
    .from('customer_applications')
    .select('status, submitted_at')
    .ilike('agency', 'GPL')
    .in('status', ['pending', 'under_review']);

  if (error) {
    logger.error({ err: error }, 'getOutstandingApplications: query failed');
    return {
      total: 0,
      by_status: {},
      by_age_bucket: { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 },
      oldest_days: null,
    };
  }

  const byStatus: Record<string, number> = {};
  const buckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  let oldest = 0;
  const now = Date.now();

  for (const row of data ?? []) {
    const status = (row.status as string) || 'pending';
    byStatus[status] = (byStatus[status] || 0) + 1;
    const submitted = row.submitted_at ? new Date(row.submitted_at as string).getTime() : null;
    if (!submitted) continue;
    const ageDays = Math.floor((now - submitted) / 86_400_000);
    if (ageDays > oldest) oldest = ageDays;
    if (ageDays <= 30) buckets['0_30']++;
    else if (ageDays <= 60) buckets['31_60']++;
    else if (ageDays <= 90) buckets['61_90']++;
    else buckets['90_plus']++;
  }

  return {
    total: (data ?? []).length,
    by_status: byStatus,
    by_age_bucket: buckets,
    oldest_days: oldest > 0 ? oldest : null,
  };
}

async function getStationHealth(): Promise<StationHealthRow[]> {
  // Reduce N most-recent rows to one row per station in JS — the schema
  // enforces unique (report_date, station) but has no view we can target.
  // TODO: replace with a `gpl_daily_stations_latest` view (`SELECT DISTINCT
  // ON (station) … ORDER BY station, report_date DESC`) so we transfer ~12
  // rows instead of ~200.
  const { data, error } = await supabaseAdmin
    .from('gpl_daily_stations')
    .select('station, report_date, total_derated_capacity_mw, total_available_mw')
    .order('report_date', { ascending: false })
    .limit(200);

  if (error) {
    logger.error({ err: error }, 'getStationHealth: query failed');
    return [];
  }

  const seen = new Set<string>();
  const rows: StationHealthRow[] = [];
  for (const r of data ?? []) {
    const station = r.station as string;
    if (seen.has(station)) continue;
    seen.add(station);
    const derated = r.total_derated_capacity_mw as number | null;
    const available = r.total_available_mw as number | null;
    const pct = deratedPct(available, derated);
    rows.push({
      station,
      report_date: r.report_date as string,
      total_derated_capacity_mw: derated,
      total_available_mw: available,
      pct_of_derated: pct,
      status: classifyStation(pct),
    });
  }

  const order: Record<string, number> = { critical: 0, degraded: 1, healthy: 2, unknown: 3 };
  rows.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
  return rows;
}

async function getRecentOutages(): Promise<{ rows: RecentOutageRow[]; count_mtd: number }> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  // PostgREST returns both rows AND the unconstrained count in a single
  // request when `count: 'exact'` is set without `head: true`. One round trip
  // for the limited list + the real MTD total.
  const { data, count, error } = await supabaseAdmin
    .from('gpl_outage_cache')
    .select(
      'outage_id, feeder_code, substation_code, areas_affected, date, time_out, duration_minutes, customers_affected, status',
      { count: 'exact' },
    )
    .gte('date', monthStartStr)
    .order('date', { ascending: false })
    .order('time_out', { ascending: false })
    .limit(50);

  if (error) {
    logger.error({ err: error }, 'getRecentOutages: query failed');
    return { rows: [], count_mtd: 0 };
  }

  const rows: RecentOutageRow[] = (data ?? []).map((r) => ({
    id: String(r.outage_id),
    feeder_code: (r.feeder_code as string | null) ?? null,
    substation_code: (r.substation_code as string | null) ?? null,
    areas_affected: (r.areas_affected as string | null) ?? null,
    date: (r.date as string | null) ?? null,
    time_out: (r.time_out as string | null) ?? null,
    duration_minutes: (r.duration_minutes as number | null) ?? null,
    customers_affected: (r.customers_affected as number | null) ?? null,
    status: (r.status as string | null) ?? null,
  }));

  return { rows, count_mtd: count ?? rows.length };
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / prior) * 100;
}

function emptyReliabilityWindow(): ReliabilityWindow {
  return { outage_count: 0, customer_hours_lost: 0, saidi_minutes: null, saifi: null };
}

// Resolves the prior-calendar-month comparator window using same-day-of-month
// clamping. May 1–8 → Apr 1–8. May 31 → Apr 1–30 (clamped). January → prior
// December. Returns ISO date strings ready for the date column predicate.
function resolveComparatorWindow(now: Date): {
  priorStart: string;
  priorEnd: string;
  label: string;
} {
  const todayDay = now.getUTCDate();
  const priorMonth0 = now.getUTCMonth() - 1;
  const priorYear = priorMonth0 < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const priorMonth = priorMonth0 < 0 ? 11 : priorMonth0;

  const priorStartDate = new Date(Date.UTC(priorYear, priorMonth, 1));
  const priorMonthLastDay = new Date(Date.UTC(priorYear, priorMonth + 1, 0)).getUTCDate();
  const priorEndDay = Math.min(todayDay, priorMonthLastDay);
  const priorEndDate = new Date(Date.UTC(priorYear, priorMonth, priorEndDay));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const monthName = priorStartDate.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  const clamped = todayDay > priorMonthLastDay;
  const label = clamped
    ? `vs ${monthName} 1–${priorMonthLastDay} (clamped)`
    : `vs ${monthName} 1–${todayDay} MTD`;
  return { priorStart: fmt(priorStartDate), priorEnd: fmt(priorEndDate), label };
}

async function getGridReliability(): Promise<GridReliability> {
  const now = new Date();
  const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const { priorStart, priorEnd, label } = resolveComparatorWindow(now);

  const [feedersRes, mtdOutRes, priorOutRes] = await Promise.all([
    supabaseAdmin.from('gpl_feeder_cache').select('customer_count, synced_at'),
    supabaseAdmin
      .from('gpl_outage_cache')
      .select('customers_affected, duration_minutes')
      .gte('date', fmt(mtdStart))
      .lte('date', fmt(now)),
    supabaseAdmin
      .from('gpl_outage_cache')
      .select('customers_affected, duration_minutes')
      .gte('date', priorStart)
      .lte('date', priorEnd),
  ]);

  if (feedersRes.error) {
    logger.error({ err: feedersRes.error }, 'getGridReliability: feeder query failed');
  }
  const feederRows = (feedersRes.data ?? []) as Array<{
    customer_count: number | null;
    synced_at: string | null;
  }>;
  const totalCustomers = feederRows.reduce(
    (s, r) => s + (Number(r.customer_count) || 0),
    0,
  );
  const feederCount = feederRows.length;
  let feederLastSync: string | null = null;
  for (const r of feederRows) {
    if (r.synced_at && (!feederLastSync || r.synced_at > feederLastSync)) {
      feederLastSync = r.synced_at;
    }
  }
  const feederDaysStale =
    feederLastSync != null
      ? Math.floor((now.getTime() - new Date(feederLastSync).getTime()) / 86_400_000)
      : null;

  function reduce(rows: { customers_affected: unknown; duration_minutes: unknown }[] | null) {
    if (!rows) return emptyReliabilityWindow();
    let count = 0;
    let customerMinutes = 0;
    let sumCustomers = 0;
    for (const r of rows) {
      count++;
      const cust = Number(r.customers_affected) || 0;
      const dur = Number(r.duration_minutes) || 0;
      customerMinutes += cust * dur;
      sumCustomers += cust;
    }
    const saidi = totalCustomers > 0 ? customerMinutes / totalCustomers : null;
    const saifi = totalCustomers > 0 ? sumCustomers / totalCustomers : null;
    return {
      outage_count: count,
      customer_hours_lost: customerMinutes / 60,
      saidi_minutes: saidi,
      saifi,
    };
  }

  const mtd = reduce(mtdOutRes.error ? null : mtdOutRes.data ?? []);
  const prior = reduce(priorOutRes.error ? null : priorOutRes.data ?? []);

  return {
    total_customers_served: totalCustomers,
    feeder_count: feederCount,
    feeder_last_sync: feederLastSync,
    feeder_days_stale: feederDaysStale,
    comparator_label: label,
    mtd,
    prior_month: prior,
    delta: {
      outage_count_pct: pctChange(mtd.outage_count, prior.outage_count),
      customer_hours_lost_pct: pctChange(mtd.customer_hours_lost, prior.customer_hours_lost),
      saidi_pct:
        mtd.saidi_minutes != null && prior.saidi_minutes != null
          ? pctChange(mtd.saidi_minutes, prior.saidi_minutes)
          : null,
      saifi_pct:
        mtd.saifi != null && prior.saifi != null ? pctChange(mtd.saifi, prior.saifi) : null,
    },
  };
}

async function getApplicationThroughput(): Promise<ApplicationThroughput> {
  const now = Date.now();
  const dayMs = 86_400_000;
  const cutoff30 = new Date(now - 30 * dayMs).toISOString();

  // Single sweep: every GPL row with the small set of fields we need.
  // ~thousands of rows max — cheaper than four count queries with separate filters.
  const { data, error } = await supabaseAdmin
    .from('customer_applications')
    .select('status, submitted_at, updated_at')
    .ilike('agency', 'GPL');

  if (error) {
    logger.error({ err: error }, 'getApplicationThroughput: query failed');
    return {
      closed_30d: 0,
      submitted_30d: 0,
      avg_days_to_close: null,
      backlog_now: 0,
      backlog_change_30d: 0,
      approval_rate_pct: null,
    };
  }

  let closed30 = 0;
  let submitted30 = 0;
  let backlogNow = 0;
  let backlog30dAgo = 0;
  let closedDaysSum = 0;
  let approved30 = 0;

  const closedStatuses = new Set(['approved', 'rejected']);
  const openStatuses = new Set(['pending', 'under_review']);

  for (const r of data ?? []) {
    const status = String(r.status ?? '');
    const submitted = r.submitted_at ? new Date(String(r.submitted_at)).getTime() : null;
    const updated = r.updated_at ? new Date(String(r.updated_at)).getTime() : null;
    const isClosed = closedStatuses.has(status);
    const isOpen = openStatuses.has(status);

    if (submitted != null && submitted >= now - 30 * dayMs) submitted30++;

    if (isClosed && updated != null && updated >= now - 30 * dayMs) {
      closed30++;
      if (status === 'approved') approved30++;
      if (submitted != null) {
        const days = Math.max(0, (updated - submitted) / dayMs);
        closedDaysSum += days;
      }
    }

    if (isOpen) backlogNow++;

    // Reconstruct backlog 30 days ago: anything submitted before that date
    // and either still open OR closed only after that date counts.
    if (submitted != null && submitted < now - 30 * dayMs) {
      if (isOpen || (isClosed && updated != null && updated >= now - 30 * dayMs)) {
        backlog30dAgo++;
      }
    }
  }

  return {
    closed_30d: closed30,
    submitted_30d: submitted30,
    avg_days_to_close: closed30 > 0 ? closedDaysSum / closed30 : null,
    backlog_now: backlogNow,
    backlog_change_30d: backlogNow - backlog30dAgo,
    approval_rate_pct: closed30 > 0 ? (approved30 / closed30) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// HAS — Airstrip operations.
//
// Mirrors the predicates in app/api/airstrips/route.ts so the count we show
// here matches the /airstrips module exactly. Six-month window for the
// overdue threshold; pending-verification = unverified maintenance log rows.
// ---------------------------------------------------------------------------

async function getHasAirstripOps(): Promise<HasAirstripOps> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10);

  const [airstripsRes, verificationRes] = await Promise.all([
    supabaseAdmin
      .from('airstrips')
      .select('id, name, region, surface_condition, status, last_inspection_date'),
    supabaseAdmin
      .from('airstrip_maintenance_log')
      .select('*', { count: 'exact', head: true })
      .eq('verified', false),
  ]);

  if (airstripsRes.error) {
    logger.error({ err: airstripsRes.error }, 'getHasAirstripOps: airstrip query failed');
    return {
      total: 0,
      operational: 0,
      limited_or_rehab: 0,
      closed: 0,
      overdue_inspection: 0,
      pending_verification: 0,
      overdue: [],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  let operational = 0;
  let limitedOrRehab = 0;
  let closed = 0;
  const overdueRows: AirstripOpsRow[] = [];

  for (const a of (airstripsRes.data ?? []) as Array<{
    id: string;
    name: string;
    region: number;
    surface_condition: string | null;
    status: string;
    last_inspection_date: string | null;
  }>) {
    total++;
    if (a.status === 'operational') operational++;
    else if (a.status === 'limited' || a.status === 'under_rehabilitation') limitedOrRehab++;
    else if (a.status === 'closed') closed++;

    const isOverdue = !a.last_inspection_date || a.last_inspection_date < cutoff;
    if (isOverdue) {
      const daysSince = a.last_inspection_date
        ? Math.floor(
            (new Date(today).getTime() - new Date(a.last_inspection_date).getTime()) /
              86_400_000,
          )
        : null;
      overdueRows.push({
        id: a.id,
        name: a.name,
        region: a.region,
        surface_condition: a.surface_condition ?? null,
        status: a.status,
        last_inspection_date: a.last_inspection_date,
        days_since_inspection: daysSince,
      });
    }
  }

  // Never-inspected first (NULL last_inspection_date), then longest-overdue first.
  overdueRows.sort((a, b) => {
    if (a.last_inspection_date == null && b.last_inspection_date == null) return 0;
    if (a.last_inspection_date == null) return -1;
    if (b.last_inspection_date == null) return 1;
    return a.last_inspection_date.localeCompare(b.last_inspection_date);
  });

  return {
    total,
    operational,
    limited_or_rehab: limitedOrRehab,
    closed,
    overdue_inspection: overdueRows.length,
    pending_verification: verificationRes.count ?? 0,
    overdue: overdueRows,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getAgencyIntelData(agencyParam: string): Promise<AgencyIntelData> {
  const lower = agencyParam.toLowerCase();
  if (!(INTEL_AGENCIES as readonly string[]).includes(lower)) {
    throw new Error(`getAgencyIntelData: unknown agency "${agencyParam}"`);
  }
  const agency = agencyParam.toUpperCase();
  const isGPL = agency === 'GPL';
  const isHAS = agency === 'HAS';

  // Fan all queries (base + agency extras) out in one shot — none depend on
  // each other and the GPL block was the longest sub-step on the GPL page.
  const [
    openTasks,
    delayedProjectsResult,
    criticalProcurement,
    evaluationTenders,
    agencyHead,
    gplExtras,
    hasExtras,
  ] = await Promise.all([
    getOpenTasksForAgency(agency),
    getProjects(
      { sort: 'overdue', sort_dir: 'desc', risk_tiers: ['HIGH', 'MEDIUM'] },
      agency,
    ),
    getCriticalTendersForAgency(agency),
    getEvaluationTendersForAgency(agency),
    getAgencyHead(agency),
    isGPL
      ? Promise.all([
          getOutstandingApplications(),
          getStationHealth(),
          getRecentOutages(),
          getGridReliability(),
          getApplicationThroughput(),
        ])
      : Promise.resolve(null),
    isHAS ? getHasAirstripOps() : Promise.resolve(null),
  ]);

  // Critical takes precedence: a tender flagged as critical (missing decision,
  // missing-from-upload, stale-award) drops out of the Evaluation card even if
  // its stage is 'evaluation'. Stops the same tender appearing in both cards.
  const criticalIds = new Set(criticalProcurement.map((t) => t.id));
  const evaluationDeduped = evaluationTenders.filter((t) => !criticalIds.has(t.id));

  const data: AgencyIntelData = {
    agency,
    generated_at: new Date().toISOString(),
    open_tasks: openTasks,
    delayed_projects: delayedProjectsResult.projects,
    critical_procurement: criticalProcurement,
    evaluation_tenders: evaluationDeduped,
    agency_head: agencyHead,
  };

  if (gplExtras) {
    const [outstandingApps, stationHealth, outages, gridReliability, appThroughput] = gplExtras;
    data.gpl = {
      outstanding_applications: outstandingApps,
      station_health: stationHealth,
      recent_outages: outages.rows,
      outage_count_mtd: outages.count_mtd,
      grid_reliability: gridReliability,
      application_throughput: appThroughput,
    };
  }

  if (hasExtras) {
    data.has = { airstrip_ops: hasExtras };
  }

  return data;
}
