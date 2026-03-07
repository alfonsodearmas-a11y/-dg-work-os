import { supabaseAdmin } from './db';

// ── Status computation (matches SQL generated column logic) ────────────────

export function computeStatus(completionPct: number, endDate: string | null, statusOverride?: string | null): string {
  if (statusOverride) {
    const map: Record<string, string> = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      on_hold: 'On Hold',
      delayed: 'Delayed',
      completed: 'Complete',
      cancelled: 'Cancelled',
    };
    return map[statusOverride] || statusOverride;
  }
  if (completionPct >= 100) return 'Complete';
  if (completionPct > 0 && endDate && new Date(endDate) < new Date()) return 'Delayed';
  if (completionPct > 0) return 'In Progress';
  return 'Not Started';
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  project_id: string;
  executing_agency: string | null;
  sub_agency: string | null;
  project_name: string | null;
  short_name: string | null;
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;
  completion_pct: number;
  has_images: number;
  status: string;         // computed
  days_overdue: number;   // computed
  health: 'green' | 'amber' | 'red';
  escalated: boolean;
  escalation_reason: string | null;
  assigned_to: string | null;
  start_date: string | null;
  status_override: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  user_id: string;
  note_text: string;
  note_type: 'general' | 'escalation' | 'status_update';
  created_at: string;
  user_name?: string;
  user_role?: string;
}

export interface ProjectSummary {
  id: string;
  project_id: string;
  summary: {
    status_snapshot: string;
    timeline_assessment: string;
    budget_position: string;
    key_risks: string[];
    recommended_actions: string[];
  };
  generated_at: string;
}

export interface AgencySummary {
  agency: string;
  total: number;
  complete: number;
  in_progress: number;
  delayed: number;
  not_started: number;
  total_value: number;
  avg_completion: number;
}

export interface PortfolioSummary {
  total_projects: number;
  total_value: number;
  complete: number;
  in_progress: number;
  delayed: number;
  not_started: number;
  delayed_value: number;
  at_risk: number;
  agencies: AgencySummary[];
  regions: Record<string, number>;
}

export interface SavedFilter {
  id: string;
  user_id: string;
  filter_name: string;
  filter_params: Record<string, any>;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Cap at $100B GYD — values above this are data-entry errors from Excel upload
const OUTLIER_CAP = 1e11;

function safeContractValue(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  if (isNaN(num) || num <= 0) return null;
  // Values above $100B are data corruption (concatenated IDs, etc.)
  if (num > OUTLIER_CAP) return null;
  return num;
}

// ── Health computation ────────────────────────────────────────────────────

export function computeHealth(
  completionPct: number,
  endDate: string | null,
  startDate: string | null,
  status: string,
  escalated: boolean,
  updatedAt?: string | null,
): 'green' | 'amber' | 'red' {
  // Completed projects are always green
  if (status === 'Complete') return 'green';

  // RED: Delayed / On Hold / Cancelled
  if (status === 'Delayed' || status === 'On Hold' || status === 'Cancelled') return 'red';

  // RED: Past end date and not complete
  if (endDate && new Date(endDate) < new Date() && completionPct < 100) return 'red';

  // RED: Escalated
  if (escalated) return 'red';

  // Progress gap analysis (if we have both start and end dates)
  if (startDate && endDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const now = Date.now();
    const totalDuration = end - start;
    if (totalDuration > 0) {
      const elapsed = Math.max(0, now - start);
      const expectedPct = Math.min(100, (elapsed / totalDuration) * 100);
      const gap = expectedPct - completionPct;
      if (gap > 25) return 'red';
      if (gap > 10) return 'amber';
    }
  }

  // AMBER: End date within 30 days and completion < 80%
  if (endDate) {
    const daysUntilEnd = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilEnd > 0 && daysUntilEnd <= 30 && completionPct < 80) return 'amber';
  }

  // AMBER: In Progress but no update in 30+ days
  if (status === 'In Progress' && updatedAt) {
    const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 30) return 'amber';
  }

  return 'green';
}

function enrichProject(row: any): Project {
  const completionPct = Number(row.completion_pct) || 0;
  const endDate = row.project_end_date || null;
  const status = computeStatus(completionPct, endDate, row.status_override);

  let daysOverdue = 0;
  if (status === 'Delayed' && endDate) {
    daysOverdue = Math.floor(
      (Date.now() - new Date(endDate).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Always compute health from actual project data (never trust DB default)
  const health = computeHealth(
    completionPct,
    endDate,
    row.start_date || null,
    status,
    row.escalated || false,
    row.updated_at || null,
  );

  return {
    ...row,
    contract_value: safeContractValue(row.contract_value),
    completion_pct: completionPct,
    status,
    days_overdue: daysOverdue,
    health,
    escalated: row.escalated || false,
    escalation_reason: row.escalation_reason || null,
    assigned_to: row.assigned_to || null,
    start_date: row.start_date || null,
    status_override: row.status_override || null,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function getPortfolioSummary(filters?: {
  agencies?: string[];
  statuses?: string[];
  regions?: string[];
  healths?: string[];
  budgetMin?: number;
  budgetMax?: number;
  contractor?: string;
  search?: string;
}): Promise<PortfolioSummary> {
  let query = supabaseAdmin
    .from('projects')
    .select('sub_agency, contract_value, completion_pct, project_end_date, health, escalated, region, status_override, start_date, updated_at');

  if (filters?.agencies?.length) query = query.in('sub_agency', filters.agencies);
  if (filters?.regions?.length) query = query.in('region', filters.regions);
  // Health filter applied client-side after computation (DB column may lag)
  if (filters?.budgetMin != null) query = query.gte('contract_value', filters.budgetMin);
  if (filters?.budgetMax != null) query = query.lte('contract_value', filters.budgetMax);
  if (filters?.contractor) query = query.ilike('contractor', `%${filters.contractor}%`);
  if (filters?.search) {
    const term = `%${filters.search}%`;
    query = query.or(`project_name.ilike.${term},contractor.ilike.${term},project_id.ilike.${term}`);
  }

  const { data } = await query;
  const rows = data || [];
  const agencies: Record<string, AgencySummary> = {};
  const regionCounts: Record<string, number> = {};
  let totalValue = 0, atRisk = 0;
  let complete = 0, inProgress = 0, delayed = 0, notStarted = 0, delayedValue = 0;

  for (const row of rows) {
    const pct = Number(row.completion_pct) || 0;
    const status = computeStatus(pct, row.project_end_date, row.status_override);
    const value = safeContractValue(row.contract_value) || 0;
    const agency = row.sub_agency || 'MOPUA';
    // Compute health from project data (not DB default)
    const health = computeHealth(pct, row.project_end_date, row.start_date, status, row.escalated || false, row.updated_at);

    // Status filter (computed, not in DB)
    if (filters?.statuses?.length) {
      if (!filters.statuses.includes(status)) continue;
    }
    // Health filter (computed, not from DB default)
    if (filters?.healths?.length) {
      if (!filters.healths.includes(health)) continue;
    }

    totalValue += value;
    if (health === 'red' || health === 'amber') atRisk++;
    if (status === 'Complete') complete++;
    else if (status === 'Delayed') { delayed++; delayedValue += value; }
    else if (status === 'In Progress') inProgress++;
    else notStarted++;

    // Region counts
    const reg = row.region || 'Unknown';
    regionCounts[reg] = (regionCounts[reg] || 0) + 1;

    if (!agencies[agency]) {
      agencies[agency] = {
        agency, total: 0, complete: 0, in_progress: 0, delayed: 0,
        not_started: 0, total_value: 0, avg_completion: 0,
      };
    }
    const a = agencies[agency];
    a.total++;
    a.total_value += value;
    a.avg_completion += pct;
    if (status === 'Complete') a.complete++;
    else if (status === 'Delayed') a.delayed++;
    else if (status === 'In Progress') a.in_progress++;
    else a.not_started++;
  }

  const agencyList = Object.values(agencies)
    .map(a => ({ ...a, avg_completion: a.total > 0 ? a.avg_completion / a.total : 0 }))
    .sort((a, b) => b.total - a.total);

  const totalFiltered = complete + inProgress + delayed + notStarted;

  return {
    total_projects: totalFiltered,
    total_value: totalValue,
    complete,
    in_progress: inProgress,
    delayed,
    not_started: notStarted,
    delayed_value: delayedValue,
    at_risk: atRisk,
    agencies: agencyList,
    regions: regionCounts,
  };
}

export async function getProjectsList(filters: {
  agencies?: string[];
  agency?: string;
  statuses?: string[];
  status?: string;
  regions?: string[];
  region?: string;
  healths?: string[];
  budgetMin?: number;
  budgetMax?: number;
  contractor?: string;
  dateField?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sort?: string;
  escalatedOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ projects: Project[]; total: number }> {
  let query = supabaseAdmin.from('projects').select('*', { count: 'exact' });

  // Multi-select agency filter (new) or single agency (backward compat)
  if (filters.agencies?.length) query = query.in('sub_agency', filters.agencies);
  else if (filters.agency) query = query.eq('sub_agency', filters.agency);

  // Multi-select region filter (new) or single region (backward compat)
  if (filters.regions?.length) query = query.in('region', filters.regions);
  else if (filters.region) query = query.eq('region', filters.region);

  // Health filter applied client-side after computation (DB column may lag)

  // Budget range
  if (filters.budgetMin != null) query = query.gte('contract_value', filters.budgetMin);
  if (filters.budgetMax != null) query = query.lte('contract_value', filters.budgetMax);

  // Contractor search
  if (filters.contractor) query = query.ilike('contractor', `%${filters.contractor}%`);

  // Date range filter
  if (filters.dateFrom || filters.dateTo) {
    const col = filters.dateField === 'start_date' ? 'start_date'
      : filters.dateField === 'updated_at' ? 'updated_at'
      : 'project_end_date';
    if (filters.dateFrom) query = query.gte(col, filters.dateFrom);
    if (filters.dateTo) query = query.lte(col, filters.dateTo);
  }

  // Escalated only
  if (filters.escalatedOnly) query = query.eq('escalated', true);

  // Search
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`project_name.ilike.${term},contractor.ilike.${term},project_id.ilike.${term}`);
  }

  // Sort — escalated first, then by chosen field
  query = query.order('escalated', { ascending: false, nullsFirst: false });

  const sortField = filters.sort || 'contract_value';
  const sortMap: Record<string, { col: string; asc: boolean }> = {
    value: { col: 'contract_value', asc: false },
    completion: { col: 'completion_pct', asc: false },
    end_date: { col: 'project_end_date', asc: true },
    agency: { col: 'sub_agency', asc: true },
    name: { col: 'project_name', asc: true },
    health: { col: 'health', asc: true },
    start_date: { col: 'start_date', asc: true },
  };
  const s = sortMap[sortField] || sortMap.value;
  query = query.order(s.col, { ascending: s.asc, nullsFirst: false });

  // Pagination
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, count } = await query;

  let projects = (data || []).map(enrichProject);

  // Client-side status filter (status is computed, not a DB column)
  const statusFilters = filters.statuses?.length ? filters.statuses : (filters.status ? [filters.status] : []);
  if (statusFilters.length) {
    projects = projects.filter(p => statusFilters.includes(p.status));
  }

  // Client-side health filter (health is computed on the fly, DB may lag)
  if (filters.healths?.length) {
    projects = projects.filter(p => filters.healths!.includes(p.health));
  }

  return { projects, total: count || 0 };
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(projectId);
  const col = isUuid ? 'id' : 'project_id';

  const { data } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq(col, projectId)
    .single();

  return data ? enrichProject(data) : null;
}

export async function getDelayedProjects(): Promise<Project[]> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('*')
    .gt('completion_pct', 0)
    .lt('completion_pct', 100);

  return (data || [])
    .map(enrichProject)
    .filter(p => p.status === 'Delayed')
    .sort((a, b) => b.days_overdue - a.days_overdue);
}

// ── Project Notes ──────────────────────────────────────────────────────────

export async function getProjectNotes(projectId: string): Promise<ProjectNote[]> {
  const { data } = await supabaseAdmin
    .from('project_notes')
    .select('*, users!project_notes_user_id_fkey(name, role)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  return (data || []).map((row: any) => ({
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    note_text: row.note_text,
    note_type: row.note_type,
    created_at: row.created_at,
    user_name: row.users?.name || 'Unknown',
    user_role: row.users?.role || 'officer',
  }));
}

export async function addProjectNote(
  projectId: string,
  userId: string,
  noteText: string,
  noteType: 'general' | 'escalation' | 'status_update' = 'general'
): Promise<ProjectNote> {
  const { data, error } = await supabaseAdmin
    .from('project_notes')
    .insert({ project_id: projectId, user_id: userId, note_text: noteText, note_type: noteType })
    .select('*, users!project_notes_user_id_fkey(name, role)')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    project_id: data.project_id,
    user_id: data.user_id,
    note_text: data.note_text,
    note_type: data.note_type,
    created_at: data.created_at,
    user_name: data.users?.name || 'Unknown',
    user_role: data.users?.role || 'officer',
  };
}

// ── Project Summary (AI cache) ────────────────────────────────────────────

export async function getProjectSummary(projectId: string): Promise<ProjectSummary | null> {
  const { data } = await supabaseAdmin
    .from('project_summaries')
    .select('*')
    .eq('project_id', projectId)
    .single();

  return data || null;
}

export async function upsertProjectSummary(
  projectId: string,
  summary: ProjectSummary['summary']
): Promise<void> {
  await supabaseAdmin
    .from('project_summaries')
    .upsert(
      { project_id: projectId, summary, generated_at: new Date().toISOString() },
      { onConflict: 'project_id' }
    );
}

// ── Escalation ────────────────────────────────────────────────────────────

export async function escalateProject(
  projectId: string,
  reason: string,
  userId: string
): Promise<void> {
  await supabaseAdmin
    .from('projects')
    .update({
      escalated: true,
      escalation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  // Also add as a project note
  await addProjectNote(projectId, userId, reason, 'escalation');
}

export async function deescalateProject(projectId: string): Promise<void> {
  await supabaseAdmin
    .from('projects')
    .update({
      escalated: false,
      escalation_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);
}

// ── Bulk Updates ──────────────────────────────────────────────────────────

export async function bulkUpdateProjects(
  projectIds: string[],
  updates: { status_override?: string; health?: string; assigned_to?: string }
): Promise<void> {
  await supabaseAdmin
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .in('id', projectIds);
}

// ── Saved Filters ─────────────────────────────────────────────────────────

export async function getSavedFilters(userId: string): Promise<SavedFilter[]> {
  const { data } = await supabaseAdmin
    .from('saved_filters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return data || [];
}

export async function saveFilter(
  userId: string,
  filterName: string,
  filterParams: Record<string, any>
): Promise<SavedFilter> {
  const { data, error } = await supabaseAdmin
    .from('saved_filters')
    .insert({ user_id: userId, filter_name: filterName, filter_params: filterParams })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFilter(filterId: string, userId: string): Promise<void> {
  await supabaseAdmin
    .from('saved_filters')
    .delete()
    .eq('id', filterId)
    .eq('user_id', userId);
}

// ── Contractors list (for filter dropdown) ────────────────────────────────

export async function getContractors(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('contractor')
    .not('contractor', 'is', null)
    .order('contractor');

  const unique = [...new Set((data || []).map((r: any) => r.contractor).filter(Boolean))];
  return unique as string[];
}

// ── Batch health recalculation ────────────────────────────────────────────

export async function recalculateAllHealth(): Promise<{ updated: number; total: number; breakdown: Record<string, number> }> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id, completion_pct, project_end_date, start_date, status_override, escalated, health, updated_at');

  if (!data) return { updated: 0, total: 0, breakdown: {} };

  const breakdown: Record<string, number> = { green: 0, amber: 0, red: 0 };
  const updates: { id: string; health: string }[] = [];

  for (const row of data) {
    const pct = Number(row.completion_pct) || 0;
    const status = computeStatus(pct, row.project_end_date, row.status_override);
    const newHealth = computeHealth(pct, row.project_end_date, row.start_date, status, row.escalated || false, row.updated_at);
    breakdown[newHealth] = (breakdown[newHealth] || 0) + 1;

    if (newHealth !== (row.health || 'green')) {
      updates.push({ id: row.id, health: newHealth });
    }
  }

  // Batch update in chunks of 50
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    for (const u of chunk) {
      await supabaseAdmin
        .from('projects')
        .update({ health: u.health })
        .eq('id', u.id);
    }
  }

  return { updated: updates.length, total: data.length, breakdown };
}
