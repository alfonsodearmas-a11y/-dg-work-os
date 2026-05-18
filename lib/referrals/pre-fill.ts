import { supabaseAdmin } from '@/lib/db';
import { fmtGuyanaDate } from '@/lib/format';
import { daysSinceISO } from '@/lib/today/severity';
import { stripEmDash } from './em-dash-guard';
import type { ReferralSourceType } from './types';

export interface ReferralPreFill {
  agency: string;
  title: string;
  days_overdue: number | null;
  contract_value: number | null;
  background: string;
  current_status: string;
}

export interface TenderShape {
  id: string;
  agency: string;
  description: string;
  stage: string;
  date_advertised: string | null;
  date_closed: string | null;
  contractor: string | null;
}

export interface ProjectShape {
  project_id: string;
  sub_agency: string | null;
  project_name: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;
  completion_pct: number | null;
}

const STAGE_LABEL: Record<string, string> = {
  design: 'design',
  advertised: 'advertised',
  evaluation: 'evaluation',
  awaiting_award: 'awaiting award',
  award: 'awarded',
};

export function composeTenderPreFill(t: TenderShape, now: Date): ReferralPreFill {
  const stageLabel = STAGE_LABEL[t.stage] ?? t.stage;
  const contractorClause = t.contractor ? ` Contractor: ${t.contractor}.` : '';
  const advertisedClause = t.date_advertised
    ? ` Advertised on ${fmtGuyanaDate(t.date_advertised)}.`
    : '';
  const closedClause = t.date_closed
    ? ` Closed on ${fmtGuyanaDate(t.date_closed)}.`
    : '';

  const background = stripEmDash(
    `Tender for ${t.description}.${advertisedClause}${closedClause}${contractorClause}`,
  );

  const daysOverdue = daysSinceISO(t.date_advertised, now);
  const overdueClause =
    daysOverdue !== null && daysOverdue > 0 ? ` It has been ${daysOverdue} days since advertisement.` : '';
  const currentStatus = stripEmDash(`This tender is currently at the ${stageLabel} stage.${overdueClause}`);

  return {
    agency: t.agency,
    title: stripEmDash(t.description),
    days_overdue: daysOverdue,
    contract_value: null,
    background,
    current_status: currentStatus,
  };
}

export function composeProjectPreFill(p: ProjectShape, now: Date): ReferralPreFill {
  const title = stripEmDash(p.project_name || p.project_id);
  const contractorClause = p.contractor ? ` Contractor: ${p.contractor}.` : '';
  const valueClause =
    p.contract_value != null
      ? ` Contract value: G$${Math.round(p.contract_value).toLocaleString('en-GY')}.`
      : '';
  const endDateClause = p.project_end_date
    ? ` Scheduled completion: ${fmtGuyanaDate(p.project_end_date)}.`
    : '';

  const background = stripEmDash(
    `Project ${p.project_id}.${contractorClause}${valueClause}${endDateClause}`,
  );

  const daysOverdue = daysSinceISO(p.project_end_date, now);
  const overdueClause =
    daysOverdue !== null && daysOverdue > 0 ? ` Currently ${daysOverdue} days past scheduled completion.` : '';
  const completionClause =
    p.completion_pct != null ? `Reported physical completion: ${Math.round(Number(p.completion_pct))}%.` : 'Completion not reported.';
  const currentStatus = stripEmDash(`${completionClause}${overdueClause}`);

  return {
    agency: (p.sub_agency || '').toUpperCase(),
    title,
    days_overdue: daysOverdue,
    contract_value: p.contract_value,
    background,
    current_status: currentStatus,
  };
}

export interface TaskShape {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  agency: string | null;
  created_at: string;
  assignee_name: string | null;
}

const TASK_STATUS_LABEL: Record<string, string> = {
  not_started: 'not started',
  in_progress: 'in progress',
  completed: 'completed',
  blocked: 'blocked',
};

export function composeTaskPreFill(t: TaskShape, now: Date): ReferralPreFill {
  const statusLabel = TASK_STATUS_LABEL[t.status] ?? t.status;
  const createdDate = fmtGuyanaDate(t.created_at);
  const assignee = t.assignee_name ?? 'unassigned';
  const description = (t.description && t.description.trim().length > 0) ? t.description : t.title;
  const background = stripEmDash(description);
  const currentStatus = stripEmDash(
    `Task assigned ${createdDate}. Status: ${statusLabel}. Assignee: ${assignee}.`,
  );
  return {
    agency: (t.agency ?? '').toUpperCase(),
    title: stripEmDash(t.title),
    days_overdue: t.due_date ? daysSinceISO(t.due_date, now) : null,
    contract_value: null,
    background,
    current_status: currentStatus,
  };
}

export async function resolvePreFill(
  sourceType: ReferralSourceType,
  sourceId: string | null,
): Promise<ReferralPreFill | null> {
  if (!sourceId) return null;
  const now = new Date();

  if (sourceType === 'tender') {
    const { data } = await supabaseAdmin
      .from('tender')
      .select('id, agency, description, stage, date_advertised, date_closed, contractor')
      .eq('id', sourceId)
      .single();
    if (!data) return null;
    return composeTenderPreFill(data as TenderShape, now);
  }

  if (sourceType === 'project') {
    const { data } = await supabaseAdmin
      .from('projects')
      .select('project_id, sub_agency, project_name, contract_value, contractor, project_end_date, completion_pct')
      .eq('project_id', sourceId)
      .single();
    if (!data) return null;
    return composeProjectPreFill(data as ProjectShape, now);
  }

  if (sourceType === 'task') {
    const { data: raw } = await supabaseAdmin
      .from('tasks')
      .select('id, title, description, status, priority, due_date, agency, created_at, owner:owner_user_id ( name )')
      .eq('id', sourceId)
      .single();
    if (!raw) return null;
    const data = raw as unknown as {
      id: string;
      title: string;
      description: string | null;
      status: string;
      priority: string | null;
      due_date: string | null;
      agency: string | null;
      created_at: string;
      owner: { name: string | null } | { name: string | null }[] | null;
    };
    const owner = Array.isArray(data.owner) ? data.owner[0] : data.owner;
    return composeTaskPreFill(
      {
        id: data.id,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        due_date: data.due_date,
        agency: data.agency,
        created_at: data.created_at,
        assignee_name: owner?.name ?? null,
      },
      now,
    );
  }

  return null;
}
