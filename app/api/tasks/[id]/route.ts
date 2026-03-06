import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { insertNotification } from '@/lib/notifications';

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
    .select('owner_user_id, assigned_by_user_id, status')
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
  if (body.blocked_reason !== undefined) updates.blocked_reason = body.blocked_reason;

  // Track completed_at
  if (body.status === 'done' && task.status !== 'done') {
    updates.completed_at = new Date().toISOString();
  }
  if (body.status && body.status !== 'done') {
    updates.completed_at = null;
  }

  // Clear blocked_reason when moving out of blocked
  if (body.status && body.status !== 'blocked' && task.status === 'blocked') {
    updates.blocked_reason = null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select('*, owner:users!owner_user_id(id, name)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten owner
  const owner = updated.owner as { id: string; name: string } | null;
  const flatTask = { ...updated, owner_name: owner?.name || null, owner: undefined };

  // Notify DG when a task is moved to blocked
  if (body.status === 'blocked' && task.status !== 'blocked') {
    // Find DG user(s) to notify
    const { data: dgUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'dg')
      .eq('is_active', true);

    for (const dg of dgUsers || []) {
      if (dg.id !== session.user.id) {
        await insertNotification({
          user_id: dg.id,
          type: 'task_blocked',
          title: `Task blocked: ${updated.title}`,
          body: body.blocked_reason || 'No reason provided',
          icon: 'task',
          priority: 'high',
          reference_type: 'task',
          reference_id: id,
          reference_url: '/tasks',
          scheduled_for: new Date().toISOString(),
          category: 'tasks',
          source_module: 'tasks',
          action_required: true,
          action_type: 'review',
        });
      }
    }
  }

  return NextResponse.json({ task: flatTask });
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

  // Only DG can delete anything; owner can delete if new
  const isDG = session.user.role === 'dg';
  const isOwnerNew = task.owner_user_id === session.user.id && task.status === 'new';

  if (!isDG && !isOwnerNew) {
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
