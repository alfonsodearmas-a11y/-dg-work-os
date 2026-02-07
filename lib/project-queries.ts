import { supabaseAdmin } from './db';

// ── Status computation (matches SQL generated column logic) ────────────────

export function computeStatus(completionPct: number, endDate: string | null): string {
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
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;
  completion_pct: number;
  has_images: number;
  status: string;         // computed
  days_overdue: number;   // computed
  created_at: string;
  updated_at: string;
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
  agencies: AgencySummary[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function enrichProject(row: any): Project {
  const completionPct = Number(row.completion_pct) || 0;
  const endDate = row.project_end_date || null;
  const status = computeStatus(completionPct, endDate);

  let daysOverdue = 0;
  if (status === 'Delayed' && endDate) {
    daysOverdue = Math.floor(
      (Date.now() - new Date(endDate).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return { ...row, completion_pct: completionPct, status, days_overdue: daysOverdue };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('sub_agency, contract_value, completion_pct, project_end_date');

  const rows = data || [];
  const agencies: Record<string, AgencySummary> = {};
  let totalValue = 0;
  let complete = 0, inProgress = 0, delayed = 0, notStarted = 0, delayedValue = 0;

  for (const row of rows) {
    const pct = Number(row.completion_pct) || 0;
    const status = computeStatus(pct, row.project_end_date);
    const value = Number(row.contract_value) || 0;
    const agency = row.sub_agency || 'MOPUA';

    totalValue += value;
    if (status === 'Complete') complete++;
    else if (status === 'Delayed') { delayed++; delayedValue += value; }
    else if (status === 'In Progress') inProgress++;
    else notStarted++;

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

  return {
    total_projects: rows.length,
    total_value: totalValue,
    complete,
    in_progress: inProgress,
    delayed,
    not_started: notStarted,
    delayed_value: delayedValue,
    agencies: agencyList,
  };
}

export async function getProjectsList(filters: {
  agency?: string;
  status?: string;
  region?: string;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<{ projects: Project[]; total: number }> {
  let query = supabaseAdmin.from('projects').select('*', { count: 'exact' });

  if (filters.agency) query = query.eq('sub_agency', filters.agency);
  if (filters.region) query = query.eq('region', filters.region);
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`project_name.ilike.${term},contractor.ilike.${term},project_id.ilike.${term}`);
  }

  // Sort
  const sortField = filters.sort || 'contract_value';
  const sortMap: Record<string, { col: string; asc: boolean }> = {
    value: { col: 'contract_value', asc: false },
    completion: { col: 'completion_pct', asc: false },
    end_date: { col: 'project_end_date', asc: true },
    agency: { col: 'sub_agency', asc: true },
    name: { col: 'project_name', asc: true },
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
  if (filters.status) {
    projects = projects.filter(p => p.status === filters.status);
  }

  return { projects, total: count || 0 };
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  // Try UUID first, then project_id text
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
