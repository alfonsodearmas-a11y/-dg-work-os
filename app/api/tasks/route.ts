import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, canAssignTasks } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { insertNotification } from '@/lib/notifications';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['new', 'active', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().optional(),
  agency: z.string().optional(),
  role: z.string().optional(),
  assignee_id: z.string().optional(),
  source_meeting_id: z.string().optional(),
});

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const agency = searchParams.get('agency');
  const overdue = searchParams.get('overdue');

  let query = supabaseAdmin
    .from('tasks')
    .select('*, owner:users!owner_user_id(id, name)')
    .order('due_date', { ascending: true, nullsFirst: false });

  // Scope by role
  if (session.user.role === 'officer') {
    query = query.eq('owner_user_id', session.user.id);
  } else if (session.user.role === 'agency_admin') {
    query = query.eq('agency', session.user.agency);
  }

  if (status) query = query.eq('status', status);
  if (agency) query = query.eq('agency', agency);
  if (overdue === 'true') {
    const today = new Date().toISOString().split('T')[0];
    query = query.lt('due_date', today).neq('status', 'done');
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten the joined owner name and group by status
  interface TaskRow { status: string; [key: string]: unknown }
  const grouped: Record<string, TaskRow[]> = {
    new: [],
    active: [],
    blocked: [],
    done: [],
  };

  for (const t of data || []) {
    const owner = t.owner as { id: string; name: string } | null;
    const task: TaskRow = { ...t, owner_name: owner?.name || null, owner: undefined };
    const col = grouped[task.status];
    if (col) col.push(task);
    else grouped.new.push(task);
  }

  return NextResponse.json({
    tasks: grouped,
    lastSync: new Date().toISOString(),
  });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { data, error: validationError } = await parseBody(request, createTaskSchema);
  if (validationError) return validationError;

  let ownerId = session.user.id;
  if (data.assignee_id && canAssignTasks(session.user.role)) {
    ownerId = data.assignee_id;
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: data.title,
      description: data.description || null,
      status: data.status || 'new',
      priority: data.priority || 'medium',
      due_date: data.due_date || null,
      agency: data.agency || null,
      role: data.role || null,
      owner_user_id: ownerId,
      assigned_by_user_id: data.assignee_id && canAssignTasks(session.user.role) ? session.user.id : null,
      source_meeting_id: data.source_meeting_id || null,
    })
    .select('*, owner:users!owner_user_id(id, name)')
    .single();

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  const owner = task.owner as { id: string; name: string } | null;
  const flatTask = { ...task, owner_name: owner?.name || null, owner: undefined };

  await supabaseAdmin.from('task_activity').insert({
    task_id: task.id,
    user_id: session.user.id,
    action: 'created',
    old_value: null,
    new_value: null,
  });

  if (data.assignee_id && canAssignTasks(session.user.role) && data.assignee_id !== session.user.id) {
    await insertNotification({
      user_id: data.assignee_id,
      type: 'task_assigned',
      title: 'New task assigned to you',
      body: task.title,
      icon: 'task',
      priority: task.priority === 'high' || task.priority === 'critical' ? 'high' : 'medium',
      reference_type: 'task',
      reference_id: task.id,
      reference_url: '/tasks',
      scheduled_for: new Date().toISOString(),
      category: 'tasks',
      source_module: 'tasks',
      action_required: true,
      action_type: 'acknowledge',
    });
  }

  return NextResponse.json({ task: flatTask });
});
