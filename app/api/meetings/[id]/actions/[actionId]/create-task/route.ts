import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { withErrorHandler, apiError } from '@/lib/api-utils';
import { TASK_COLUMNS, flattenTaskOwner } from '@/lib/task-types';

export const POST = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id: meetingId, actionId } = await (
    ctx as { params: Promise<{ id: string; actionId: string }> }
  ).params;

  // Fetch the action item
  const { data: action, error: actionErr } = await supabaseAdmin
    .from('meeting_actions')
    .select('id, meeting_id, task, owner, due_date, task_id')
    .eq('id', actionId)
    .eq('meeting_id', meetingId)
    .single();

  if (actionErr || !action) {
    return apiError('NOT_FOUND', 'Action item not found', 404);
  }

  if (action.task_id) {
    return apiError('CONFLICT', 'Task already created for this action', 409);
  }

  // Fetch meeting title
  const { data: meeting } = await supabaseAdmin
    .from('meetings')
    .select('title')
    .eq('id', meetingId)
    .single();

  const meetingTitle = meeting?.title || 'Unknown meeting';

  // Create the task
  const { data: task, error: taskErr } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: action.task.slice(0, 100),
      description: `${action.task}\n\nCreated from meeting: ${meetingTitle}`,
      status: 'new',
      priority: 'medium',
      due_date: action.due_date || null,
      owner_user_id: session.user.id,
      source_meeting_id: meetingId,
      role: 'Meeting Action Item',
    })
    .select(`${TASK_COLUMNS}, owner:users!owner_user_id(id, name)`)
    .single();

  if (taskErr || !task) {
    return apiError('DB_ERROR', taskErr?.message || 'Failed to create task', 500);
  }

  // Link task back to the action
  await supabaseAdmin
    .from('meeting_actions')
    .update({ task_id: task.id })
    .eq('id', actionId)
    .eq('meeting_id', meetingId);

  // Record activity
  await supabaseAdmin.from('task_activity').insert({
    task_id: task.id,
    user_id: session.user.id,
    action: 'created',
    old_value: null,
    new_value: null,
  });

  return NextResponse.json({ task: flattenTaskOwner(task) });
});
