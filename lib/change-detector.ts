import { supabaseAdmin } from './db';
import { ProjectRow } from './excel-parser';

export interface Changes {
  new_projects: ProjectRow[];
  status_changes: Array<{
    project_reference: string;
    project_name: string;
    sub_agency: string | null;
    from_status: string | null;
    to_status: string | null;
  }>;
  completion_changes: Array<{
    project_reference: string;
    project_name: string;
    sub_agency: string | null;
    from_percent: number | null;
    to_percent: number | null;
    delta: number;
  }>;
  expenditure_changes: Array<{
    project_reference: string;
    project_name: string;
    sub_agency: string | null;
    from_expenditure: number | null;
    to_expenditure: number | null;
    delta: number;
  }>;
}

export async function detectChanges(newProjects: ProjectRow[]): Promise<Changes> {
  // Get previous snapshot
  const { data: previousProjects } = await supabaseAdmin
    .from('projects')
    .select('project_reference, project_status, completion_percent, total_expenditure');

  const previousMap = new Map(
    previousProjects?.map(p => [p.project_reference, p]) || []
  );

  const changes: Changes = {
    new_projects: [],
    status_changes: [],
    completion_changes: [],
    expenditure_changes: []
  };

  for (const project of newProjects) {
    const previous = previousMap.get(project.project_reference);

    if (!previous) {
      changes.new_projects.push(project);
      continue;
    }

    if (previous.project_status !== project.project_status) {
      changes.status_changes.push({
        project_reference: project.project_reference,
        project_name: project.project_name,
        sub_agency: project.sub_agency,
        from_status: previous.project_status,
        to_status: project.project_status
      });
    }

    const completionDelta = (project.completion_percent || 0) - (previous.completion_percent || 0);
    if (Math.abs(completionDelta) >= 5) {
      changes.completion_changes.push({
        project_reference: project.project_reference,
        project_name: project.project_name,
        sub_agency: project.sub_agency,
        from_percent: previous.completion_percent,
        to_percent: project.completion_percent,
        delta: completionDelta
      });
    }

    const expenditureDelta = (project.total_expenditure || 0) - (previous.total_expenditure || 0);
    if (expenditureDelta > 0) {
      changes.expenditure_changes.push({
        project_reference: project.project_reference,
        project_name: project.project_name,
        sub_agency: project.sub_agency,
        from_expenditure: previous.total_expenditure,
        to_expenditure: project.total_expenditure,
        delta: expenditureDelta
      });
    }
  }

  return changes;
}
