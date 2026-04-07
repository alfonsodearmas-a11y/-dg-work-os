import { supabaseAdmin } from './db';
import { logger } from '@/lib/logger';
import type { OversightProject, OversightSummary, OversightAgencyBreakdown } from '@/components/oversight/types';

// ── Filters ────────────────────────────────────────────────────────────────

const SORT_FIELD_MAP: Record<string, string> = {
  value: 'contract_value_total',
  completion: 'completion_percent',
  end_date: 'project_end_date',
  agency: 'sub_agency',
  name: 'project_name',
  status: 'project_status',
  region: 'region',
};

export interface OversightFilters {
  sub_agencies?: string[];
  statuses?: string[];
  regions?: number[];
  completion_min?: number;
  completion_max?: number;
  search?: string;
  sort?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// ── Summary ────────────────────────────────────────────────────────────────

export async function getOversightSummary(agencyFilter?: string): Promise<OversightSummary> {
  let query = supabaseAdmin.from('projects_oversight').select('sub_agency, project_status, completion_percent, contract_value_total');
  if (agencyFilter) query = query.eq('sub_agency', agencyFilter);

  const { data: rows, error } = await query;
  if (error) {
    logger.error({ error }, 'Failed to fetch oversight summary');
    return { total_projects: 0, total_contract_value: 0, avg_completion: 0, by_status: {}, by_agency: [] };
  }

  const projects = (rows || []) as { sub_agency: string; project_status: string; completion_percent: number; contract_value_total: number | null }[];
  const total_projects = projects.length;
  const total_contract_value = projects.reduce((sum, p) => sum + (p.contract_value_total || 0), 0);
  const avg_completion = total_projects > 0
    ? Math.round(projects.reduce((sum, p) => sum + p.completion_percent, 0) / total_projects)
    : 0;

  const by_status: Record<string, number> = {};
  for (const p of projects) {
    const s = p.project_status || 'UNKNOWN';
    by_status[s] = (by_status[s] || 0) + 1;
  }

  const agencyMap = new Map<string, { count: number; total_value: number; total_completion: number }>();
  for (const p of projects) {
    const a = p.sub_agency;
    const entry = agencyMap.get(a) || { count: 0, total_value: 0, total_completion: 0 };
    entry.count++;
    entry.total_value += p.contract_value_total || 0;
    entry.total_completion += p.completion_percent;
    agencyMap.set(a, entry);
  }

  const by_agency: OversightAgencyBreakdown[] = Array.from(agencyMap.entries())
    .map(([agency, d]) => ({
      agency,
      count: d.count,
      total_value: d.total_value,
      avg_completion: d.count > 0 ? Math.round(d.total_completion / d.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { total_projects, total_contract_value, avg_completion, by_status, by_agency };
}

// ── Paginated List ─────────────────────────────────────────────────────────

export async function getOversightProjects(
  filters: OversightFilters,
  agencyFilter?: string
): Promise<{ projects: OversightProject[]; total: number }> {
  const page = filters.page || 1;
  const limit = filters.limit || 25;
  const offset = (page - 1) * limit;

  // Count query
  let countQuery = supabaseAdmin.from('projects_oversight').select('id', { count: 'exact', head: true });
  // Data query
  let dataQuery = supabaseAdmin.from('projects_oversight').select('*');

  // Apply shared filters to both queries
  function applyFilters<T extends typeof countQuery>(q: T): T {
    if (agencyFilter) q = q.eq('sub_agency', agencyFilter) as T;
    if (filters.sub_agencies?.length) q = q.in('sub_agency', filters.sub_agencies) as T;
    if (filters.statuses?.length) q = q.in('project_status', filters.statuses) as T;
    if (filters.regions?.length) q = q.in('region', filters.regions) as T;
    if (filters.completion_min !== undefined) q = q.gte('completion_percent', filters.completion_min) as T;
    if (filters.completion_max !== undefined) q = q.lte('completion_percent', filters.completion_max) as T;
    if (filters.search) {
      q = q.or(`project_name.ilike.%${filters.search}%,project_reference.ilike.%${filters.search}%`) as T;
    }
    return q;
  }

  countQuery = applyFilters(countQuery);
  dataQuery = applyFilters(dataQuery);

  const sortField = filters.sort || 'contract_value_total';
  const sortDir = filters.sort_dir || 'desc';
  const dbColumn = SORT_FIELD_MAP[sortField] || sortField;
  dataQuery = dataQuery.order(dbColumn, { ascending: sortDir === 'asc', nullsFirst: false });

  // Paginate
  dataQuery = dataQuery.range(offset, offset + limit - 1);

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

  if (countResult.error) logger.error({ error: countResult.error }, 'Oversight count query failed');
  if (dataResult.error) logger.error({ error: dataResult.error }, 'Oversight data query failed');

  return {
    projects: (dataResult.data || []) as OversightProject[],
    total: countResult.count || 0,
  };
}

// ── Single Project ─────────────────────────────────────────────────────────

export async function getOversightProjectById(id: string): Promise<OversightProject | null> {
  // Try UUID first, then integer project_id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const { data, error } = isUuid
    ? await supabaseAdmin.from('projects_oversight').select('*').eq('id', id).single()
    : await supabaseAdmin.from('projects_oversight').select('*').eq('project_id', parseInt(id, 10)).single();

  if (error) {
    if (error.code !== 'PGRST116') logger.error({ error, id }, 'Failed to fetch oversight project');
    return null;
  }

  return data as OversightProject;
}

// ── Distinct Contractors ───────────────────────────────────────────────────

export async function getOversightContractors(agencyFilter?: string): Promise<string[]> {
  let query = supabaseAdmin.from('projects_oversight').select('contractors');
  if (agencyFilter) query = query.eq('sub_agency', agencyFilter);

  const { data, error } = await query;
  if (error) {
    logger.error({ error }, 'Failed to fetch oversight contractors');
    return [];
  }

  const set = new Set<string>();
  for (const row of data || []) {
    const arr = row.contractors as string[] | null;
    if (arr) for (const c of arr) set.add(c);
  }

  return Array.from(set).sort();
}
