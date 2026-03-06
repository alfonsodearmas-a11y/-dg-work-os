import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAssignTasks } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { insertNotification } from '@/lib/notifications';

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

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const body = await request.json();

  if (!body.title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Determine owner
  let ownerId = session.user.id;
  if (body.assignee_id && canAssignTasks(session.user.role)) {
    ownerId = body.assignee_id;
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: body.title,
      description: body.description || null,
      status: body.status || 'new',
      priority: body.priority || 'medium',
      due_date: body.due_date || null,
      agency: body.agency || null,
      role: body.role || null,
      owner_user_id: ownerId,
      assigned_by_user_id: body.assignee_id && canAssignTasks(session.user.role) ? session.user.id : null,
      source_meeting_id: body.source_meeting_id || null,
    })
    .select('*, owner:users!owner_user_id(id, name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten owner
  const owner = task.owner as { id: string; name: string } | null;
  const flatTask = { ...task, owner_name: owner?.name || null, owner: undefined };

  // Log activity
  await supabaseAdmin.from('task_activity').insert({
    task_id: task.id,
    user_id: session.user.id,
    action: 'created',
    old_value: null,
    new_value: null,
  });

  // Notify the assignee when a task is assigned to someone else
  if (body.assignee_id && canAssignTasks(session.user.role) && body.assignee_id !== session.user.id) {
    await insertNotification({
      user_id: body.assignee_id,
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
}
