import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return result;

  const body = await request.json();
  const { taskIds, updates } = body;

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ error: 'No tasks provided' }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.due_date !== undefined) updatePayload.due_date = updates.due_date;
  if (updates.assignee_id !== undefined) updatePayload.owner_user_id = updates.assignee_id;
  if (updates.agency !== undefined) updatePayload.agency = updates.agency;
  if (updates.status !== undefined) {
    updatePayload.status = updates.status;
    if (updates.status === 'done') {
      updatePayload.completed_at = new Date().toISOString();
    } else {
      updatePayload.completed_at = null;
    }
    if (updates.status === 'blocked' && updates.blocked_reason) {
      updatePayload.blocked_reason = updates.blocked_reason;
    }
    if (updates.status !== 'blocked') {
      updatePayload.blocked_reason = null;
    }
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .update(updatePayload)
    .in('id', taskIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  const body = await request.json();
  const { taskIds } = body;

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ error: 'No tasks provided' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .in('id', taskIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
