import { supabaseAdmin } from '@/lib/db';
import type { ActionItem, MeetingMinutes } from '@/lib/meeting-minutes';
import { getMinutesById } from '@/lib/meeting-minutes';

// ── Types ──────────────────────────────────────────────────────────────────

export interface LinkedActionItem extends ActionItem {
  junction_id: string | null;
  task_id: string | null;
  task_status: string | null;
  link_status: 'created' | 'failed' | 'unlinked';
  error_message: string | null;
}

interface TaskCreationResult {
  created: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ── Valid agency values for the task system ─────────────────────────────────

const VALID_AGENCIES = new Set(['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'Ministry']);

function mapAgency(agency: string | null): string | null {
  if (!agency) return null;
  const upper = agency.toUpperCase();
  if (VALID_AGENCIES.has(upper)) return upper;
  if (agency.toLowerCase() === 'ministry') return 'Ministry';
  return null;
}

function formatMeetingDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Create Tasks from Action Items ─────────────────────────────────────────

export async function createTasksFromActionItems(meetingId: string): Promise<TaskCreationResult> {
  const meeting = await getMinutesById(meetingId);
  if (!meeting) throw new Error('Meeting not found');

  const actionItems: ActionItem[] = Array.isArray(meeting.action_items) ? meeting.action_items : [];
  if (actionItems.length === 0) return { created: 0, failed: 0, skipped: 0, errors: [] };

  // Check for existing links (duplicate prevention)
  const { data: existingLinks } = await supabaseAdmin
    .from('meeting_action_items')
    .select('action_item_id')
    .eq('meeting_id', meetingId)
    .eq('status', 'created');

  const linkedIds = new Set((existingLinks || []).map((r: any) => r.action_item_id));

  const result: TaskCreationResult = { created: 0, failed: 0, skipped: 0, errors: [] };

  for (const item of actionItems) {
    // Skip if already linked
    if (linkedIds.has(item.id)) {
      result.skipped++;
      continue;
    }

    try {
      const descLines: string[] = [];
      if (item.description) descLines.push(item.description);
      descLines.push('');
      descLines.push(`From: ${meeting.title}, ${formatMeetingDate(meeting.meeting_date)}`);
      descLines.push(`Meeting minutes: /meetings/${meeting.id}`);
      if (item.assigned_to) {
        descLines.push(`Assigned to: ${item.assigned_to}`);
      }

      const agency = mapAgency(item.agency);

      // Insert into native tasks table
      const { data: task, error: taskErr } = await supabaseAdmin
        .from('tasks')
        .insert({
          title: item.title,
          description: descLines.join('\n'),
          status: 'not_started',
          priority: item.priority?.toLowerCase() || 'medium',
          due_date: item.deadline || null,
          agency,
          source_meeting_id: meetingId,
        })
        .select('id')
        .single();

      if (taskErr) throw taskErr;

      // Insert junction row
      await supabaseAdmin
        .from('meeting_action_items')
        .upsert({
          meeting_id: meetingId,
          task_id: task.id,
          action_item_id: item.id,
          title: item.title,
          assigned_to: item.assigned_to || null,
          status: 'created',
        }, { onConflict: 'meeting_id,action_item_id' });

      result.created++;
    } catch (error: any) {
      // Log failure in junction table
      await supabaseAdmin
        .from('meeting_action_items')
        .upsert({
          meeting_id: meetingId,
          task_id: null,
          action_item_id: item.id,
          title: item.title,
          assigned_to: item.assigned_to || null,
          status: 'failed',
          error_message: error.message || 'Unknown error',
        }, { onConflict: 'meeting_id,action_item_id' });

      result.failed++;
      result.errors.push(`${item.id}: ${error.message}`);
    }
  }

  return result;
}

// ── Get Action Items with Task Status ──────────────────────────────────────

export async function getActionItemsWithStatus(meetingId: string): Promise<LinkedActionItem[]> {
  const meeting = await getMinutesById(meetingId);
  if (!meeting) return [];

  const actionItems: ActionItem[] = Array.isArray(meeting.action_items) ? meeting.action_items : [];
  if (actionItems.length === 0) return [];

  // Fetch junction table entries
  const { data: links } = await supabaseAdmin
    .from('meeting_action_items')
    .select('*')
    .eq('meeting_id', meetingId);

  const linkMap = new Map<string, any>();
  for (const link of links || []) {
    linkMap.set(link.action_item_id, link);
  }

  // Fetch task statuses from native tasks table
  const taskIds = (links || [])
    .filter((l: any) => l.task_id && l.status === 'created')
    .map((l: any) => l.task_id);

  const taskStatusMap = new Map<string, string>();
  if (taskIds.length > 0) {
    const { data: tasks } = await supabaseAdmin
      .from('tasks')
      .select('id, status')
      .in('id', taskIds);

    for (const t of tasks || []) {
      taskStatusMap.set(t.id, t.status);
    }
  }

  return actionItems.map(item => {
    const link = linkMap.get(item.id);
    return {
      ...item,
      junction_id: link?.id || null,
      task_id: link?.task_id || null,
      task_status: link?.task_id ? (taskStatusMap.get(link.task_id) || null) : null,
      link_status: link ? link.status : 'unlinked',
      error_message: link?.error_message || null,
    };
  });
}

// ── Get Action Item Summary for Meeting Cards ──────────────────────────────

export async function getActionItemSummary(meetingId: string): Promise<{
  total: number;
  created: number;
  completed: number;
  failed: number;
}> {
  const items = await getActionItemsWithStatus(meetingId);
  return {
    total: items.length,
    created: items.filter(i => i.link_status === 'created').length,
    completed: items.filter(i => i.task_status === 'Done').length,
    failed: items.filter(i => i.link_status === 'failed').length,
  };
}

// ── Unlink Action Items (for regeneration) ─────────────────────────────────

export async function unlinkActionItems(meetingId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('meeting_action_items')
    .delete()
    .eq('meeting_id', meetingId)
    .select('id');

  return data?.length || 0;
}

// ── Retry Failed Action Items ──────────────────────────────────────────────

export async function retryFailedActionItems(meetingId: string): Promise<TaskCreationResult> {
  // Delete failed entries so createTasksFromActionItems will re-process them
  await supabaseAdmin
    .from('meeting_action_items')
    .delete()
    .eq('meeting_id', meetingId)
    .eq('status', 'failed');

  return createTasksFromActionItems(meetingId);
}
