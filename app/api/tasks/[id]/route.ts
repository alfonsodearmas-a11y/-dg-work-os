import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;
  const body = await request.json();

  // Ownership check
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('owner_user_id, assigned_by_user_id')
    .eq('id', id)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const isOwner = task.owner_user_id === session.user.id;
  const isAssigner = task.assigned_by_user_id === session.user.id;
  const isMinistryRole = ['dg', 'minister', 'ps'].includes(session.user.role);

  if (!isOwner && !isAssigner && !isMinistryRole) {
    return NextResponse.json({ error: 'Not authorized to update this task' }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.due_date !== undefined) updates.due_date = body.due_date;
  if (body.agency !== undefined) updates.agency = body.agency;
  if (body.role !== undefined) updates.role = body.role;

  const { data: updated, error } = await supabaseAdmin
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  // Fetch task
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('owner_user_id, status')
    .eq('id', id)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Only DG can delete anything; owner can delete if not_started
  const isDG = session.user.role === 'dg';
  const isOwnerNotStarted = task.owner_user_id === session.user.id && task.status === 'not_started';

  if (!isDG && !isOwnerNotStarted) {
    return NextResponse.json({ error: 'Not authorized to delete this task' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
