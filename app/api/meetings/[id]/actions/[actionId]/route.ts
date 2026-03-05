import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id, actionId } = await params;
  const body = await request.json();

  // If body is empty, toggle done (backward compat)
  const hasFields = body.task !== undefined || body.owner !== undefined ||
    body.due_date !== undefined || body.done !== undefined;

  let updates: Record<string, unknown>;

  if (hasFields) {
    updates = {};
    if (body.task !== undefined) updates.task = body.task;
    if (body.owner !== undefined) updates.owner = body.owner;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.done !== undefined) updates.done = body.done;
  } else {
    // Toggle done
    const { data: action, error: fetchError } = await supabaseAdmin
      .from('meeting_actions')
      .select('id, done')
      .eq('id', actionId)
      .eq('meeting_id', id)
      .single();

    if (fetchError || !action) {
      return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
    }
    updates = { done: !action.done };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('meeting_actions')
    .update(updates)
    .eq('id', actionId)
    .eq('meeting_id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ action: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id, actionId } = await params;

  const { error } = await supabaseAdmin
    .from('meeting_actions')
    .delete()
    .eq('id', actionId)
    .eq('meeting_id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
