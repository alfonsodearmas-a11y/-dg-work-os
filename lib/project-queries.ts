import { supabaseAdmin } from './db';

// Delayed projects
export async function getDelayedProjects() {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('project_status', 'DELAYED')
    .order('contract_value', { ascending: false });
  return data || [];
}

// Problem projects (high spend, low completion)
export async function getProblemProjects() {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('*')
    .gt('allocated_balance', 0)
    .gt('total_expenditure', 0);

  if (!data) return [];

  return data
    .map(p => {
      const spendPercent = (p.total_expenditure / p.allocated_balance) * 100;
      const variance = spendPercent - (p.completion_percent || 0);
      return { ...p, spend_percent: spendPercent, variance };
    })
    .filter(p => p.variance > 10)
    .sort((a, b) => b.variance - a.variance);
}

// Summary by agency
export async function getAgencySummary() {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('sub_agency, project_status, contract_value, completion_percent');

  if (!data) return [];

  const summary: Record<string, {
    agency: string;
    total: number;
    completed: number;
    in_progress: number;
    delayed: number;
    cancelled: number;
    total_value: number;
    avg_completion: number;
  }> = {};

  for (const project of data) {
    const agency = project.sub_agency || 'Other';
    if (!summary[agency]) {
      summary[agency] = {
        agency,
        total: 0,
        completed: 0,
        in_progress: 0,
        delayed: 0,
        cancelled: 0,
        total_value: 0,
        avg_completion: 0
      };
    }

    summary[agency].total++;
    summary[agency].total_value += project.contract_value || 0;
    summary[agency].avg_completion += project.completion_percent || 0;

    switch (project.project_status) {
      case 'COMPLETED': summary[agency].completed++; break;
      case 'COMMENCED': summary[agency].in_progress++; break;
      case 'DELAYED': summary[agency].delayed++; break;
      case 'CANCELLED': summary[agency].cancelled++; break;
    }
  }

  return Object.values(summary).map(s => ({
    ...s,
    avg_completion: s.total > 0 ? s.avg_completion / s.total : 0
  }));
}

// Get all projects with optional filters
export async function getProjects(filters?: {
  agency?: string;
  status?: string;
  year?: number;
}) {
  let query = supabaseAdmin.from('projects').select('*');

  if (filters?.agency) {
    query = query.eq('sub_agency', filters.agency);
  }
  if (filters?.status) {
    query = query.eq('project_status', filters.status);
  }
  if (filters?.year) {
    query = query.eq('project_year', filters.year);
  }

  const { data } = await query.order('contract_value', { ascending: false });
  return data || [];
}

// Get latest changes
export async function getLatestChanges() {
  const { data: upload } = await supabaseAdmin
    .from('project_uploads')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single();

  return upload?.changes_summary || null;
}
