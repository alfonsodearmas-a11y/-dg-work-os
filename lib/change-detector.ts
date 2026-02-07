import { supabaseAdmin } from './db';
import { ProjectRow } from './excel-parser';

export interface Changes {
  new_projects: string[];
  updated_projects: number;
  total: number;
}

export async function detectChanges(newProjects: ProjectRow[]): Promise<Changes> {
  const { data: existing } = await supabaseAdmin
    .from('projects')
    .select('project_id');

  const existingIds = new Set(existing?.map(p => p.project_id) || []);

  const newIds = newProjects
    .filter(p => !existingIds.has(p.project_id))
    .map(p => p.project_id);

  return {
    new_projects: newIds,
    updated_projects: newProjects.length - newIds.length,
    total: newProjects.length,
  };
}
