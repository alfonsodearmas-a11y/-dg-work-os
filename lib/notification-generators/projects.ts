import { insertNotification } from '../notifications';
import type { Notification, GenerateResult } from '../notifications';
import { getDelayedProjects, getProjectsList } from '../project-queries';

export async function generateProjectNotifications(userId: string): Promise<GenerateResult> {
  const created: Notification[] = [];
  const today = new Date();
  const morningSlot = `${today.toISOString().split('T')[0]}T08:00:00.000Z`;

  try {
    // 1. Newly delayed projects (delayed <= 3 days)
    const delayed = await getDelayedProjects();
    for (const p of delayed) {
      if (p.days_overdue > 3) continue;
      const inserted = await insertNotification({
        user_id: userId,
        type: 'project_newly_delayed',
        title: `Project delayed: ${p.project_name || 'Unnamed'}`,
        body: `${p.executing_agency || 'Unknown agency'} — ${p.days_overdue} day${p.days_overdue !== 1 ? 's' : ''} overdue (${p.completion_pct}% complete)`,
        icon: 'project',
        priority: 'high',
        reference_type: 'project',
        reference_id: p.project_id,
        reference_url: `/projects/${p.id}`,
        scheduled_for: morningSlot,
        category: 'projects',
        source_module: 'projects',
        action_required: true,
        action_type: 'review',
        metadata: {
          agency: p.executing_agency,
          completion_pct: p.completion_pct,
          days_overdue: p.days_overdue,
          contract_value: p.contract_value,
        },
      });
      if (inserted) created.push(inserted);
    }

    // 2. Stalled projects: <50% complete with <30 days left
    const { projects: allProjects } = await getProjectsList({ limit: 500 });
    for (const p of allProjects) {
      if (p.status !== 'In Progress' || !p.project_end_date) continue;
      if (p.completion_pct >= 50) continue;
      const endDate = new Date(p.project_end_date);
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      if (daysLeft < 0 || daysLeft > 30) continue;

      const inserted = await insertNotification({
        user_id: userId,
        type: 'project_stalled',
        title: `Project at risk: ${p.project_name || 'Unnamed'}`,
        body: `${p.completion_pct}% complete with ${daysLeft} days remaining — ${p.executing_agency || 'Unknown'}`,
        icon: 'project',
        priority: 'high',
        reference_type: 'project',
        reference_id: p.project_id,
        reference_url: `/projects/${p.id}`,
        scheduled_for: morningSlot,
        category: 'projects',
        source_module: 'projects',
        action_required: false,
        metadata: {
          agency: p.executing_agency,
          completion_pct: p.completion_pct,
          days_remaining: daysLeft,
          contract_value: p.contract_value,
        },
      });
      if (inserted) created.push(inserted);
    }
  } catch (err) {
    console.error('Error generating project notifications:', err);
  }

  return { count: created.length, notifications: created };
}
