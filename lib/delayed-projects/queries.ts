import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  type DelayedProject,
  type DelayedProjectWithComputed,
  type DelayedProjectSnapshot,
  type Intervention,
  type WarRoomSummary,
  type AgencyBreakdown,
  type RegionBreakdown,
  type WeeklyMovement,
  type DeltaEntry,
  type InterventionSummary,
  type ProjectDetail,
  type RegistryFilters,
  type InterventionFilters,
  type InterventionType,
  type InterventionStatus,
  type ClearedAnalytics,
  enrichProject,
  computeDaysOverdue,
  computeRemainingValue,
  computeRiskTier,
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SORT_MAP: Record<string, string> = {
  value: 'contract_value',
  completion: 'completion_percent',
  end_date: 'project_end_date',
  agency: 'sub_agency',
  name: 'project_name',
  region: 'region',
  resolved_at: 'resolved_at',
};

// ── Snapshot Delta Computation ───────────────────────────────────────────────

async function getLatestSnapshotMap(): Promise<
  Map<string, { completion_percent: number; snapshot_date: string }>
> {
  // Get the most recent snapshot date
  const { data: dateRow } = await supabaseAdmin
    .from('delayed_project_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (!dateRow) return new Map();

  const { data: snapshots } = await supabaseAdmin
    .from('delayed_project_snapshots')
    .select('project_id, completion_percent, snapshot_date')
    .eq('snapshot_date', dateRow.snapshot_date);

  const map = new Map<string, { completion_percent: number; snapshot_date: string }>();
  for (const s of snapshots || []) {
    map.set(s.project_id, {
      completion_percent: s.completion_percent ?? 0,
      snapshot_date: s.snapshot_date,
    });
  }
  return map;
}

async function getStalledWeeks(projectId: string): Promise<number> {
  const { data: snapshots } = await supabaseAdmin
    .from('delayed_project_snapshots')
    .select('completion_percent, snapshot_date')
    .eq('project_id', projectId)
    .order('snapshot_date', { ascending: false })
    .limit(10);

  if (!snapshots || snapshots.length < 2) return 0;

  let count = 0;
  for (let i = 0; i < snapshots.length - 1; i++) {
    const curr = snapshots[i].completion_percent ?? 0;
    const prev = snapshots[i + 1].completion_percent ?? 0;
    if (Math.abs(curr - prev) < 1) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ── Paginated Project List ──────────────────────────────────────────────────

export async function getProjects(
  filters: RegistryFilters,
  agencyFilter?: string,
): Promise<{ projects: DelayedProjectWithComputed[]; total: number }> {
  const page = filters.page || 1;
  const limit = filters.limit || 25;
  const offset = (page - 1) * limit;
  const statusFilter = filters.status ?? 'DELAYED';

  let countQuery = supabaseAdmin
    .from('delayed_projects')
    .select('id', { count: 'exact', head: true });
  let dataQuery = supabaseAdmin.from('delayed_projects').select('*');

  function applyFilters<T extends typeof countQuery>(q: T): T {
    q = q.eq('status', statusFilter) as T;
    if (agencyFilter) q = q.eq('sub_agency', agencyFilter) as T;
    if (filters.sub_agencies?.length) q = q.in('sub_agency', filters.sub_agencies) as T;
    if (filters.regions?.length) q = q.in('region', filters.regions) as T;
    if (filters.completion_min !== undefined) q = q.gte('completion_percent', filters.completion_min) as T;
    if (filters.completion_max !== undefined) q = q.lte('completion_percent', filters.completion_max) as T;
    if (filters.search) {
      q = q.or(`project_name.ilike.%${filters.search}%,project_reference.ilike.%${filters.search}%,contractors.ilike.%${filters.search}%`) as T;
    }
    return q;
  }

  countQuery = applyFilters(countQuery);
  dataQuery = applyFilters(dataQuery);

  // Default sort: RESOLVED view sorts by resolved_at desc; DELAYED view by remaining_value desc
  const defaultSort = statusFilter === 'RESOLVED' ? 'resolved_at' : 'remaining_value';
  const sortField = filters.sort || defaultSort;
  const sortDir = filters.sort_dir || 'desc';
  const COMPUTED_SORTS = new Set(['remaining_value', 'risk', 'overdue', 'interventions']);
  const isComputedSort = COMPUTED_SORTS.has(sortField);

  if (!isComputedSort) {
    const dbColumn = SORT_MAP[sortField] || sortField;
    dataQuery = dataQuery.order(dbColumn, { ascending: sortDir === 'asc', nullsFirst: false });
  }
  dataQuery = dataQuery.range(offset, offset + limit - 1);

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

  if (countResult.error) logger.error({ error: countResult.error }, 'Delayed projects count failed');
  if (dataResult.error) logger.error({ error: dataResult.error }, 'Delayed projects list failed');

  const rawProjects = (dataResult.data || []) as DelayedProject[];

  // Get latest snapshot map and intervention counts in parallel
  const [snapshotMap, interventionData] = await Promise.all([
    getLatestSnapshotMap(),
    supabaseAdmin.from('interventions').select('project_id'),
  ]);

  // Build per-project intervention count map
  const interventionCountMap = new Map<string, number>();
  for (const row of interventionData.data || []) {
    interventionCountMap.set(row.project_id, (interventionCountMap.get(row.project_id) || 0) + 1);
  }

  // Risk tier filtering happens post-query since it's computed
  let enriched = rawProjects.map((p) => {
    const snap = snapshotMap.get(p.id);
    const delta = snap ? Number(p.completion_percent) - snap.completion_percent : null;
    const intCount = interventionCountMap.get(p.id) || 0;
    return enrichProject(p, delta, null, intCount);
  });

  // Post-enrichment sort for computed fields
  if (isComputedSort) {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'remaining_value') {
      enriched.sort((a, b) => dir * (a.remaining_value - b.remaining_value));
    } else if (sortField === 'risk') {
      const RISK_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NO_DATA: 3 };
      enriched.sort((a, b) => dir * ((RISK_ORDER[a.risk_tier] ?? 4) - (RISK_ORDER[b.risk_tier] ?? 4)));
    } else if (sortField === 'overdue') {
      enriched.sort((a, b) => dir * ((a.days_overdue ?? -Infinity) - (b.days_overdue ?? -Infinity)));
    } else if (sortField === 'interventions') {
      enriched.sort((a, b) => dir * (a.intervention_count - b.intervention_count));
    }
  }

  // Risk tier is computed, not stored — filter post-query and adjust total
  if (filters.risk_tiers?.length) {
    enriched = enriched.filter((p) => filters.risk_tiers!.includes(p.risk_tier));
    // Total is approximate when risk-tier filtered since we can't filter in DB
    return { projects: enriched, total: enriched.length };
  }

  // For RESOLVED view: attach human-readable batch metadata
  if (statusFilter === 'RESOLVED') {
    const batchIds = [
      ...new Set(
        enriched
          .map((p) => p.resolved_by_batch_id)
          .filter((id): id is string => id != null),
      ),
    ];
    if (batchIds.length > 0) {
      const { data: batches } = await supabaseAdmin
        .from('upload_batches')
        .select('id, file_name, uploaded_at')
        .in('id', batchIds);
      const batchMap = new Map<string, { file_name: string | null; uploaded_at: string }>();
      for (const b of batches || []) {
        batchMap.set(b.id, { file_name: b.file_name, uploaded_at: b.uploaded_at });
      }
      enriched = enriched.map((p) => {
        if (p.resolved_by_batch_id) {
          const batch = batchMap.get(p.resolved_by_batch_id);
          if (batch) {
            return {
              ...p,
              resolved_by_file: batch.file_name,
              resolved_by_uploaded_at: batch.uploaded_at,
            };
          }
        }
        return p;
      });
    }
  }

  return {
    projects: enriched,
    total: countResult.count || 0,
  };
}

// ── Summary ─────────────────────────────────────────────────────────────────

export async function getSummary(agencyFilter?: string): Promise<WarRoomSummary> {
  let query = supabaseAdmin
    .from('delayed_projects')
    .select('id, sub_agency, region, contract_value, completion_percent, project_end_date, status, project_name')
    .eq('status', 'DELAYED');
  if (agencyFilter) query = query.eq('sub_agency', agencyFilter);

  const { data: rows, error } = await query;
  if (error) {
    logger.error({ error }, 'Failed to fetch war room summary');
    return emptySummary();
  }

  const projects = (rows || []) as DelayedProject[];
  if (projects.length === 0) return emptySummary();

  let totalValue = 0;
  let totalExposure = 0;
  let totalCompletion = 0;
  let criticalCount = 0;
  let longestOverdue = 0;

  // Popover enrichment data
  type PRef = { name: string; agency: string; completion: number; days_overdue: number; remaining_value: number };
  let longestOverdueProject: PRef | null = null;
  const criticalProjects: PRef[] = [];
  const topExposure: PRef[] = []; // maintain top 5 by remaining_value

  const agencyMap = new Map<string, { count: number; total_value: number; total_completion: number; total_overdue: number; overdue_count: number }>();
  const regionMap = new Map<string, { count: number; total_exposure: number; high_count: number }>();

  for (const p of projects) {
    const cv = Number(p.contract_value) || 0;
    const pct = Number(p.completion_percent) || 0;
    const remaining = computeRemainingValue(cv, pct);
    const daysOverdue = computeDaysOverdue(p.project_end_date);
    const riskTier = computeRiskTier(p.project_end_date, pct, cv);

    const ref: PRef = {
      name: p.project_name || 'Unknown',
      agency: p.sub_agency,
      completion: pct,
      days_overdue: daysOverdue ?? 0,
      remaining_value: remaining,
    };

    totalValue += cv;
    totalExposure += remaining;
    totalCompletion += pct;
    if (riskTier === 'HIGH') { criticalCount++; criticalProjects.push(ref); }
    if (daysOverdue !== null && daysOverdue > longestOverdue) { longestOverdue = daysOverdue; longestOverdueProject = ref; }
    // Maintain top 5 by remaining_value (O(n) instead of sort-then-slice)
    if (topExposure.length < 5 || remaining > topExposure[topExposure.length - 1].remaining_value) {
      topExposure.push(ref);
      topExposure.sort((a, b) => b.remaining_value - a.remaining_value);
      if (topExposure.length > 5) topExposure.pop();
    }

    // Agency breakdown
    const ae = agencyMap.get(p.sub_agency) || { count: 0, total_value: 0, total_completion: 0, total_overdue: 0, overdue_count: 0 };
    ae.count++;
    ae.total_value += cv;
    ae.total_completion += pct;
    if (daysOverdue !== null && daysOverdue > 0) {
      ae.total_overdue += daysOverdue;
      ae.overdue_count++;
    }
    agencyMap.set(p.sub_agency, ae);

    // Region breakdown
    const regionKey = p.region || 'Unknown';
    const re = regionMap.get(regionKey) || { count: 0, total_exposure: 0, high_count: 0 };
    re.count++;
    re.total_exposure += remaining;
    if (riskTier === 'HIGH') re.high_count++;
    regionMap.set(regionKey, re);
  }

  const by_agency: AgencyBreakdown[] = Array.from(agencyMap.entries())
    .map(([agency, d]) => ({
      agency,
      count: d.count,
      total_value: d.total_value,
      avg_completion: d.count > 0 ? Math.round((d.total_completion / d.count) * 10) / 10 : 0,
      avg_days_overdue: d.overdue_count > 0 ? Math.round(d.total_overdue / d.overdue_count) : 0,
    }))
    .sort((a, b) => b.total_value - a.total_value);

  const by_region: RegionBreakdown[] = Array.from(regionMap.entries())
    .map(([region, d]) => ({
      region,
      count: d.count,
      total_exposure: d.total_exposure,
      avg_risk: d.count > 0 ? d.high_count / d.count : 0,
    }))
    .sort((a, b) => b.total_exposure - a.total_exposure);

  // Fetch weekly movement, snapshot count, and last upload date in parallel
  const [weeklyMovement, { count: snapshotCount }, lastUploadDate] = await Promise.all([
    getWeeklyMovement(),
    supabaseAdmin
      .from('delayed_project_snapshots')
      .select('snapshot_date', { count: 'exact', head: true }),
    getLastUploadDate(),
  ]);

  return {
    total_projects: projects.length,
    total_contract_value: totalValue,
    total_exposure: totalExposure,
    avg_completion: projects.length > 0 ? Math.round((totalCompletion / projects.length) * 10) / 10 : 0,
    critical_count: criticalCount,
    longest_overdue: longestOverdue,
    by_agency,
    by_region,
    weekly_movement: weeklyMovement,
    last_upload_date: lastUploadDate,
    snapshot_count: snapshotCount || 0,
    longest_overdue_project: longestOverdueProject,
    critical_projects: criticalProjects,
    top_exposure_projects: topExposure,
  };
}

function emptySummary(): WarRoomSummary {
  return {
    total_projects: 0,
    total_contract_value: 0,
    total_exposure: 0,
    avg_completion: 0,
    critical_count: 0,
    longest_overdue: 0,
    by_agency: [],
    by_region: [],
    weekly_movement: null,
    last_upload_date: null,
    snapshot_count: 0,
    longest_overdue_project: null,
    critical_projects: [],
    top_exposure_projects: [],
  };
}

// ── Weekly Movement ─────────────────────────────────────────────────────────

async function getWeeklyMovement(): Promise<WeeklyMovement | null> {
  // Get snapshot map (pre-upload state) and latest batch in parallel
  const [snapshotMap, batchResult, delayedResult] = await Promise.all([
    getLatestSnapshotMap(),
    supabaseAdmin
      .from('upload_batches')
      .select('uploaded_at, new_count, resolved_count, reopened_count')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('delayed_projects')
      .select('id, project_name, sub_agency, completion_percent')
      .eq('status', 'DELAYED'),
  ]);

  // No snapshots = no movement data
  if (snapshotMap.size === 0) return null;

  const latestBatch = batchResult.data;
  const liveProjects = (delayedResult.data || []) as {
    id: string;
    project_name: string;
    sub_agency: string;
    completion_percent: number;
  }[];

  // Determine anchor dates
  const snapshotDates = [...snapshotMap.values()].map((v) => v.snapshot_date);
  const latestSnapshotDate = snapshotDates.reduce((a, b) => (a > b ? a : b), snapshotDates[0]);
  const previousDate = latestSnapshotDate;
  const currentDate = latestBatch?.uploaded_at
    ? latestBatch.uploaded_at.slice(0, 10)
    : latestSnapshotDate;

  // Source new_entries / cleared / reopened from latest batch
  const newEntries = latestBatch?.new_count ?? 0;
  const cleared = latestBatch?.resolved_count ?? 0;
  const reopened = latestBatch?.reopened_count ?? 0;

  // Compute progressed / stalled / regressed: snapshot (pre-upload) vs live (still DELAYED)
  let progressed = 0;
  let stalled = 0;
  let regressed = 0;
  const deltas: DeltaEntry[] = [];

  for (const live of liveProjects) {
    const snap = snapshotMap.get(live.id);
    if (!snap) continue; // no snapshot = we can't compute a delta

    const delta = Number(live.completion_percent) - snap.completion_percent;

    if (delta > 1) progressed++;
    else if (delta < -1) regressed++;
    else stalled++;

    deltas.push({
      project_id: live.id,
      project_name: live.project_name || 'Unknown',
      sub_agency: live.sub_agency || 'Unknown',
      previous_pct: snap.completion_percent,
      current_pct: Number(live.completion_percent),
      delta,
    });
  }

  // Top movers (positive delta, top 5 desc) and top stalls (|delta| < 1, top 5)
  const sorted = [...deltas].sort((a, b) => b.delta - a.delta);
  const topMovers = sorted.filter((d) => d.delta > 1).slice(0, 5);
  const topStalls = sorted.filter((d) => Math.abs(d.delta) < 1).slice(0, 5);

  return {
    previous_date: previousDate,
    current_date: currentDate,
    progressed,
    stalled,
    regressed,
    new_entries: newEntries,
    cleared,
    reopened,
    top_movers: topMovers,
    top_stalls: topStalls,
  };
}

// ── Single Project ──────────────────────────────────────────────────────────

export async function getProjectById(id: string): Promise<ProjectDetail | null> {
  const { data, error } = await supabaseAdmin
    .from('delayed_projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    if (error?.code !== 'PGRST116') logger.error({ error, id }, 'Failed to fetch delayed project');
    return null;
  }

  const project = data as DelayedProject;

  // Fetch snapshots and interventions in parallel
  const [{ data: snapshots }, { data: interventions }] = await Promise.all([
    supabaseAdmin
      .from('delayed_project_snapshots')
      .select('*')
      .eq('project_id', id)
      .order('snapshot_date', { ascending: true })
      .limit(20),
    supabaseAdmin
      .from('interventions')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const snapshotList = (snapshots || []) as DelayedProjectSnapshot[];

  // Compute delta from latest snapshot
  let deltaCompletion: number | null = null;
  if (snapshotList.length > 0) {
    const latest = snapshotList[snapshotList.length - 1];
    deltaCompletion = Number(project.completion_percent) - (latest.completion_percent ?? 0);
  }

  // Compute stalled weeks from already-fetched snapshots (no extra DB call)
  let stalledWeeks = 0;
  const descSnapshots = [...snapshotList].reverse();
  for (let i = 0; i < descSnapshots.length - 1; i++) {
    const curr = descSnapshots[i].completion_percent ?? 0;
    const prev = descSnapshots[i + 1].completion_percent ?? 0;
    if (Math.abs(curr - prev) < 1) stalledWeeks++;
    else break;
  }

  return {
    ...enrichProject(project, deltaCompletion, stalledWeeks),
    snapshots: snapshotList,
    interventions: (interventions || []) as Intervention[],
  };
}

// ── Interventions ───────────────────────────────────────────────────────────

export async function getInterventions(
  filters: InterventionFilters,
): Promise<{ interventions: (Intervention & { project_name?: string; sub_agency?: string })[]; total: number }> {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  let countQuery = supabaseAdmin
    .from('interventions')
    .select('id', { count: 'exact', head: true });
  let dataQuery = supabaseAdmin
    .from('interventions')
    .select('*, delayed_projects!inner(project_name, sub_agency)');

  function applyFilters<T extends typeof countQuery>(q: T): T {
    if (filters.project_id) q = q.eq('project_id', filters.project_id) as T;
    if (filters.status?.length) q = q.in('status', filters.status) as T;
    if (filters.intervention_type?.length) q = q.in('intervention_type', filters.intervention_type) as T;
    return q;
  }

  countQuery = applyFilters(countQuery);
  dataQuery = applyFilters(dataQuery);

  dataQuery = dataQuery.order('created_at', { ascending: false });
  dataQuery = dataQuery.range(offset, offset + limit - 1);

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

  if (countResult.error) logger.error({ error: countResult.error }, 'Interventions count failed');
  if (dataResult.error) logger.error({ error: dataResult.error }, 'Interventions list failed');

  // Flatten the joined data
  const interventions = (dataResult.data || []).map((row: Record<string, unknown>) => {
    const joined = row.delayed_projects as { project_name: string; sub_agency: string } | null;
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      intervention_type: row.intervention_type as InterventionType,
      description: row.description as string,
      assigned_to: row.assigned_to as string | null,
      due_date: row.due_date as string | null,
      status: row.status as InterventionStatus,
      created_by: row.created_by as string,
      created_at: row.created_at as string,
      project_name: joined?.project_name,
      sub_agency: joined?.sub_agency,
    };
  });

  return {
    interventions,
    total: countResult.count || 0,
  };
}

export async function createIntervention(data: {
  project_id: string;
  intervention_type: InterventionType;
  description: string;
  assigned_to?: string | null;
  due_date?: string | null;
  created_by: string;
}): Promise<Intervention> {
  const { data: row, error } = await supabaseAdmin
    .from('interventions')
    .insert({
      project_id: data.project_id,
      intervention_type: data.intervention_type,
      description: data.description,
      assigned_to: data.assigned_to || null,
      due_date: data.due_date || null,
      status: 'PENDING',
      created_by: data.created_by,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error }, 'Failed to create intervention');
    throw new Error(error.message);
  }

  return row as Intervention;
}

export async function updateInterventionStatus(
  id: string,
  status: InterventionStatus,
): Promise<Intervention> {
  const { data: row, error } = await supabaseAdmin
    .from('interventions')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error({ error }, 'Failed to update intervention');
    throw new Error(error.message);
  }

  return row as Intervention;
}

export async function getIntervention(id: string): Promise<Intervention | null> {
  const { data, error } = await supabaseAdmin
    .from('interventions')
    .select()
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Intervention;
}

export async function deleteIntervention(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('interventions')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error({ error }, 'Failed to delete intervention');
    throw new Error(error.message);
  }
}

export async function getInterventionSummary(): Promise<InterventionSummary> {
  // Scope to DELAYED projects only via inner join so counts never include RESOLVED-project interventions.
  // This ensures total_projects (DELAYED count) >= projectsWithInterventions.size, keeping projects_with_zero >= 0.
  const { data: interventions, error } = await supabaseAdmin
    .from('interventions')
    .select('id, status, project_id, delayed_projects!inner(status)')
    .eq('delayed_projects.status', 'DELAYED');

  if (error) {
    logger.error({ error }, 'Failed to fetch intervention summary');
    return { total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0, projects_with_zero: 0, total_projects: 0 };
  }

  // Strip the joined `delayed_projects` field — we only needed it for filtering.
  const rows = (interventions || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    status: row.status as string,
    project_id: row.project_id as string,
  }));

  const pending = rows.filter((r) => r.status === 'PENDING').length;
  const in_progress = rows.filter((r) => r.status === 'IN_PROGRESS').length;
  const completed = rows.filter((r) => r.status === 'COMPLETED').length;
  const overdue = rows.filter((r) => r.status === 'OVERDUE').length;

  // Count DELAYED projects (now guaranteed >= projectsWithInterventions.size).
  const { count: totalProjects } = await supabaseAdmin
    .from('delayed_projects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'DELAYED');

  const projectsWithInterventions = new Set(rows.map((r) => r.project_id));

  return {
    total: rows.length,
    pending,
    in_progress,
    completed,
    overdue,
    projects_with_zero: (totalProjects || 0) - projectsWithInterventions.size,
    total_projects: totalProjects || 0,
  };
}

// ── Last Upload Date ────────────────────────────────────────────────────────

export async function getLastUploadDate(): Promise<string | null> {
  // Primary: authoritative upload record
  const { data: batchRow } = await supabaseAdmin
    .from('upload_batches')
    .select('uploaded_at')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (batchRow?.uploaded_at) return batchRow.uploaded_at;

  // Fallback: pre-reconcile data (no batch rows yet) — use max updated_at
  const { data: projectRow } = await supabaseAdmin
    .from('delayed_projects')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return projectRow?.updated_at || null;
}

// ── Cleared Analytics ────────────────────────────────────────────────────────

export async function getClearedAnalytics(
  agencyFilter?: string,
  filters?: Pick<RegistryFilters, 'sub_agencies' | 'regions' | 'search'>,
): Promise<ClearedAnalytics> {
  let query = supabaseAdmin
    .from('delayed_projects')
    .select('contract_value, resolved_at, created_at')
    .eq('status', 'RESOLVED');

  if (agencyFilter) query = query.eq('sub_agency', agencyFilter);
  if (filters?.sub_agencies?.length) query = query.in('sub_agency', filters.sub_agencies);
  if (filters?.regions?.length) query = query.in('region', filters.regions);
  if (filters?.search) {
    query = query.or(
      `project_name.ilike.%${filters.search}%,project_reference.ilike.%${filters.search}%,contractors.ilike.%${filters.search}%`,
    );
  }

  const { data: rows, error } = await query;
  if (error) {
    logger.error({ error }, 'getClearedAnalytics failed');
    return { count: 0, total_contract_value: 0, avg_days_to_clear: null };
  }

  const records = rows || [];
  let totalValue = 0;
  let daysSum = 0;
  let daysCount = 0;

  for (const r of records) {
    totalValue += Number(r.contract_value) || 0;
    if (r.resolved_at && r.created_at) {
      const days = (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 86400000;
      if (!isNaN(days)) {
        daysSum += days;
        daysCount++;
      }
    }
  }

  return {
    count: records.length,
    total_contract_value: totalValue,
    avg_days_to_clear: daysCount > 0 ? Math.round((daysSum / daysCount) * 10) / 10 : null,
  };
}
