import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAssignTasks } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

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
    .select('*')
    .order('due_date', { ascending: true });

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
    query = query.lt('due_date', today).neq('status', 'completed');
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by status for kanban view
  const grouped = {
    not_started: [] as any[],
    in_progress: [] as any[],
    blocked: [] as any[],
    completed: [] as any[],
  };

  for (const task of data || []) {
    const col = grouped[task.status as keyof typeof grouped];
    if (col) col.push(task);
    else grouped.not_started.push(task);
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
      status: body.status || 'not_started',
      priority: body.priority || 'medium',
      due_date: body.due_date || null,
      agency: body.agency || null,
      role: body.role || null,
      owner_user_id: ownerId,
      assigned_by_user_id: body.assignee_id && canAssignTasks(session.user.role) ? session.user.id : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task });
}
