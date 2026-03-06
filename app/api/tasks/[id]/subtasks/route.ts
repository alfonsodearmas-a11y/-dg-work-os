import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('subtasks')
    .select('*')
    .eq('task_id', id)
    .order('position', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subtasks: data || [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;
  const body = await request.json();

  if (!body.title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Get max position
  const { data: existing } = await supabaseAdmin
    .from('subtasks')
    .select('position')
    .eq('task_id', id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data: subtask, error } = await supabaseAdmin
    .from('subtasks')
    .insert({
      task_id: id,
      title: body.title,
      position: nextPosition,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subtask });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  await params; // consume params
  const body = await request.json();

  if (!body.subtaskId) {
    return NextResponse.json({ error: 'subtaskId is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.done !== undefined) updates.done = body.done;

  const { data, error } = await supabaseAdmin
    .from('subtasks')
    .update(updates)
    .eq('id', body.subtaskId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subtask: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  await params; // consume params
  const body = await request.json();

  if (!body.subtaskId) {
    return NextResponse.json({ error: 'subtaskId is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('subtasks')
    .delete()
    .eq('id', body.subtaskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
