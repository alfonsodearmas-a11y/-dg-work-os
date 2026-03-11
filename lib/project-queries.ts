import { supabaseAdmin } from './db';
import { PROJECT_CONTRACT_CAP } from '@/lib/constants/config';
import { logger } from '@/lib/logger';

// ── Status computation (uses scraped project_status from oversight.gov.gy) ──

export function computeStatus(projectStatus: string | null): string {
  if (!projectStatus) return 'Unknown';
  return projectStatus.charAt(0).toUpperCase() + projectStatus.slice(1).toLowerCase();
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
  tender_board_type: string | null;
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
  revised_start_date: string | null;
  // Detail fields from oversight scraper
  balance_remaining: number | null;
  remarks: string | null;
  project_status: string | null;
  extension_reason: string | null;
  extension_date: string | null;
  project_extended: boolean;
  total_distributed: number | null;
  total_expended: number | null;
  created_at: string;
  updated_at: string;
}

export interface FundingDistribution {
  id: string;
  project_id: string;
  date_distributed: string | null;
  payment_type: string | null;
  amount_distributed: number | null;
  amount_expended: number | null;
  distributed_balance: number | null;
  funding_remarks: string | null;
  contract_ref: string | null;
  created_at: string;
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

const OUTLIER_CAP = PROJECT_CONTRACT_CAP;

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
  projectStatus: string | null,
  escalated: boolean,
  updatedAt?: string | null,
): 'green' | 'amber' | 'red' {
  const raw = (projectStatus || '').toUpperCase();

  // COMPLETED projects are always green
  if (raw === 'COMPLETED' || completionPct >= 100) return 'green';

  // RED: DELAYED
  if (raw === 'DELAYED') return 'red';

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

  // AMBER: COMMENCED but no update in 30+ days
  if (raw === 'COMMENCED' && updatedAt) {
    const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 30) return 'amber';
  }

  return 'green';
}

function enrichProject(row: any): Project {
  const completionPct = Number(row.completion_pct) || 0;
  const endDate = row.project_end_date || null;
  const projectStatus = row.project_status || null;
  const status = computeStatus(projectStatus);

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
    projectStatus,
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
    revised_start_date: row.revised_start_date || null,
    // Detail fields
    balance_remaining: row.balance_remaining ?? null,
    remarks: row.remarks || null,
    project_status: projectStatus,
    extension_reason: row.extension_reason || null,
    extension_date: row.extension_date || null,
    project_extended: row.project_extended || false,
    total_distributed: row.total_distributed ?? null,
    total_expended: row.total_expended ?? null,
    tender_board_type: row.tender_board_type || null,
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
    .select('sub_agency, contract_value, completion_pct, project_end_date, health, escalated, region, project_status, start_date, updated_at');

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
    const status = computeStatus(row.project_status);
    const value = safeContractValue(row.contract_value) || 0;
    const agency = row.sub_agency || 'MOPUA';
    // Compute health from project data (not DB default)
    const health = computeHealth(pct, row.project_end_date, row.start_date, row.project_status, row.escalated || false, row.updated_at);

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
    // Count as completed if project_status says so OR completion_pct >= 100
    const isComplete = status === 'Completed' || pct >= 100;
    if (isComplete) complete++;
    else if (status === 'Delayed') { delayed++; delayedValue += value; }
    else if (status === 'Commenced') inProgress++;
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
    if (isComplete) a.complete++;
    else if (status === 'Delayed') a.delayed++;
    else if (status === 'Commenced') a.in_progress++;
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
  // Determine if we need client-side filtering (status/health are computed fields)
  const statusFilters = filters.statuses?.length ? filters.statuses : (filters.status ? [filters.status] : []);
  const needsClientFilter = statusFilters.length > 0 || (filters.healths?.length ?? 0) > 0;

  // When status/health filters are active, we must fetch ALL matching rows first,
  // apply computed filters, THEN paginate — otherwise pagination skips matching rows.
  let query = supabaseAdmin.from('projects').select('*', { count: 'exact' });

  // Multi-select agency filter (new) or single agency (backward compat)
  if (filters.agencies?.length) query = query.in('sub_agency', filters.agencies);
  else if (filters.agency) query = query.eq('sub_agency', filters.agency);

  // Multi-select region filter (new) or single region (backward compat)
  if (filters.regions?.length) query = query.in('region', filters.regions);
  else if (filters.region) query = query.eq('region', filters.region);

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

  const page = filters.page || 1;
  const limit = filters.limit || 50;

  // When client-side filtering is needed, fetch all rows (up to a high limit)
  // to avoid Supabase's default 1000-row cap silently truncating results.
  // When no client-side filtering, use normal DB-level pagination.
  if (needsClientFilter) {
    query = query.range(0, 4999);
  } else {
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);
  }

  const { data, error: queryError, count } = await query;

  if (queryError) {
    logger.error({ err: queryError }, 'getProjectsList query error');
    return { projects: [], total: 0 };
  }

  let projects = (data || []).map(enrichProject);

  // Apply computed-field filters (status and health are derived, not stored reliably)
  if (statusFilters.length) {
    projects = projects.filter(p => statusFilters.includes(p.status));
  }
  if (filters.healths?.length) {
    projects = projects.filter(p => filters.healths!.includes(p.health));
  }

  // When client-side filtering was used, paginate the filtered results
  const total = needsClientFilter ? projects.length : (count || 0);
  if (needsClientFilter) {
    const from = (page - 1) * limit;
    projects = projects.slice(from, from + limit);
  }

  return { projects, total };
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
  updates: { health?: string; assigned_to?: string }
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
    .select('id, completion_pct, project_end_date, start_date, project_status, escalated, health, updated_at');

  if (!data) return { updated: 0, total: 0, breakdown: {} };

  const breakdown: Record<string, number> = { green: 0, amber: 0, red: 0 };
  const updates: { id: string; health: string }[] = [];

  for (const row of data) {
    const pct = Number(row.completion_pct) || 0;
    const newHealth = computeHealth(pct, row.project_end_date, row.start_date, row.project_status, row.escalated || false, row.updated_at);
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

// ── Distinct statuses (for filter dropdowns) ──────────────────────────────

export async function getDistinctStatuses(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('project_status')
    .not('project_status', 'is', null)
    .order('project_status');

  const unique = [...new Set((data || []).map((r: any) => r.project_status).filter(Boolean))];
  return unique as string[];
}

// ── Funding Distributions ─────────────────────────────────────────────────

export async function getProjectFunding(projectId: string): Promise<FundingDistribution[]> {
  const { data } = await supabaseAdmin
    .from('funding_distributions')
    .select('*')
    .eq('project_id', projectId)
    .order('date_distributed', { ascending: true });

  return (data || []) as FundingDistribution[];
}
