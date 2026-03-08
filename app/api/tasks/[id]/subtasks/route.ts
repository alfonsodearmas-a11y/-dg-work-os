import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const createSubtaskSchema = z.object({
  title: z.string().min(1),
});

const patchSubtaskSchema = z.object({
  subtaskId: z.string().min(1),
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
});

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

export const POST = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown,
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error: validationError } = await parseBody(request, createSubtaskSchema);
  if (validationError) return validationError;

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
      title: data.title,
      position: nextPosition,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  return NextResponse.json({ subtask });
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown,
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error: validationError } = await parseBody(request, patchSubtaskSchema);
  if (validationError) return validationError;

  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.done !== undefined) updates.done = data.done;

  const { data: subtaskData, error } = await supabaseAdmin
    .from('subtasks')
    .update(updates)
    .eq('id', data.subtaskId)
    .select()
    .single();

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  return NextResponse.json({ subtask: subtaskData });
});

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
