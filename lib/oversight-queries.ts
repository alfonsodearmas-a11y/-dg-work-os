import { supabaseAdmin } from './db';
import { logger } from '@/lib/logger';
import type { OversightProject, DelayedSummary, OversightAgencyBreakdown } from '@/components/oversight/types';

const SORT_FIELD_MAP: Record<string, string> = {
  value: 'contract_value_total',
  completion: 'completion_percent',
  end_date: 'project_end_date',
  agency: 'sub_agency',
  name: 'project_name',
  region: 'region',
};

// ── Filters ────────────────────────────────────────────────────────────────

export interface OversightFilters {
  sub_agencies?: string[];
  regions?: number[];
  completion_min?: number;
  completion_max?: number;
  end_date_from?: string;
  end_date_to?: string;
  contractor_search?: string;
  search?: string;
  sort?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// ── Delayed Summary ────────────────────────────────────────────────────────

export async function getDelayedSummary(agencyFilter?: string): Promise<DelayedSummary> {
  let query = supabaseAdmin
    .from('projects_oversight')
    .select('sub_agency, completion_percent, contract_value_total, project_end_date')
    .eq('is_resolved', false);
  if (agencyFilter) query = query.eq('sub_agency', agencyFilter);

  const { data: rows, error } = await query;
  if (error) {
    logger.error({ error }, 'Failed to fetch delayed summary');
    return {
      total_delayed: 0, total_contract_value: 0, avg_completion: 0,
      past_deadline_count: 0, within_deadline_count: 0, no_date_count: 0,
      by_agency: [], completion_bands: { '0_25': 0, '26_50': 0, '51_75': 0, '76_100': 0 },
    };
  }

  const projects = (rows || []) as {
    sub_agency: string; completion_percent: number;
    contract_value_total: number | null; project_end_date: string | null;
  }[];

  const now = new Date();
  let total_contract_value = 0;
  let total_completion = 0;
  let past_deadline_count = 0;
  let within_deadline_count = 0;
  let no_date_count = 0;
  const bands = { '0_25': 0, '26_50': 0, '51_75': 0, '76_100': 0 };
  const agencyMap = new Map<string, { count: number; total_value: number; total_completion: number }>();

  for (const p of projects) {
    total_contract_value += p.contract_value_total || 0;
    total_completion += p.completion_percent;

    // Deadline categorization
    if (!p.project_end_date) {
      no_date_count++;
    } else {
      const end = new Date(p.project_end_date + 'T00:00:00');
      if (end < now) past_deadline_count++;
      else within_deadline_count++;
    }

    // Completion bands
    const pct = p.completion_percent;
    if (pct <= 25) bands['0_25']++;
    else if (pct <= 50) bands['26_50']++;
    else if (pct <= 75) bands['51_75']++;
    else bands['76_100']++;

    // Agency breakdown
    const entry = agencyMap.get(p.sub_agency) || { count: 0, total_value: 0, total_completion: 0 };
    entry.count++;
    entry.total_value += p.contract_value_total || 0;
    entry.total_completion += p.completion_percent;
    agencyMap.set(p.sub_agency, entry);
  }

  const total_delayed = projects.length;
  const avg_completion = total_delayed > 0 ? Math.round(total_completion / total_delayed) : 0;

  const by_agency: OversightAgencyBreakdown[] = Array.from(agencyMap.entries())
    .map(([agency, d]) => ({
      agency,
      count: d.count,
      total_value: d.total_value,
      avg_completion: d.count > 0 ? Math.round(d.total_completion / d.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total_delayed, total_contract_value, avg_completion,
    past_deadline_count, within_deadline_count, no_date_count,
    by_agency, completion_bands: bands,
  };
}

// ── Paginated List ─────────────────────────────────────────────────────────

export async function getOversightProjects(
  filters: OversightFilters,
  agencyFilter?: string
): Promise<{ projects: OversightProject[]; total: number }> {
  const page = filters.page || 1;
  const limit = filters.limit || 25;
  const offset = (page - 1) * limit;

  let countQuery = supabaseAdmin.from('projects_oversight').select('id', { count: 'exact', head: true });
  let dataQuery = supabaseAdmin.from('projects_oversight').select('*');

  function applyFilters<T extends typeof countQuery>(q: T): T {
    q = q.eq('is_resolved', false) as T;
    if (agencyFilter) q = q.eq('sub_agency', agencyFilter) as T;
    if (filters.sub_agencies?.length) q = q.in('sub_agency', filters.sub_agencies) as T;
    if (filters.regions?.length) q = q.in('region', filters.regions) as T;
    if (filters.completion_min !== undefined) q = q.gte('completion_percent', filters.completion_min) as T;
    if (filters.completion_max !== undefined) q = q.lte('completion_percent', filters.completion_max) as T;
    if (filters.end_date_from) q = q.gte('project_end_date', filters.end_date_from) as T;
    if (filters.end_date_to) q = q.lte('project_end_date', filters.end_date_to) as T;
    if (filters.search) {
      q = q.or(`project_name.ilike.%${filters.search}%,project_reference.ilike.%${filters.search}%`) as T;
    }
    if (filters.contractor_search) {
      q = q.contains('contractors', [filters.contractor_search]) as T;
    }
    return q;
  }

  countQuery = applyFilters(countQuery);
  dataQuery = applyFilters(dataQuery);

  const sortField = filters.sort || 'contract_value_total';
  const sortDir = filters.sort_dir || 'desc';
  const dbColumn = SORT_FIELD_MAP[sortField] || sortField;
  dataQuery = dataQuery.order(dbColumn, { ascending: sortDir === 'asc', nullsFirst: false });
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
  let query = supabaseAdmin.from('projects_oversight').select('contractors').eq('is_resolved', false);
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
