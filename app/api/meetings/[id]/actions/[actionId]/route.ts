import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const patchActionSchema = z.object({
  task: z.string().min(1).optional(),
  owner: z.string().optional(),
  due_date: z.string().optional(),
  done: z.boolean().optional(),
  confidence: z.string().optional(),
  skipped: z.boolean().optional(),
  task_id: z.string().optional(),
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id, actionId } = await (ctx as { params: Promise<{ id: string; actionId: string }> }).params;
  const { data, error } = await parseBody(request, patchActionSchema);
  if (error) return error;

  const hasFields = data!.task !== undefined || data!.owner !== undefined ||
    data!.due_date !== undefined || data!.done !== undefined ||
    data!.confidence !== undefined || data!.skipped !== undefined ||
    data!.task_id !== undefined;

  let updates: Record<string, unknown>;

  if (hasFields) {
    updates = {};
    if (data!.task !== undefined) updates.task = data!.task;
    if (data!.owner !== undefined) updates.owner = data!.owner;
    if (data!.due_date !== undefined) updates.due_date = data!.due_date;
    if (data!.done !== undefined) updates.done = data!.done;
    if (data!.confidence !== undefined) updates.confidence = data!.confidence;
    if (data!.skipped !== undefined) updates.skipped = data!.skipped;
    if (data!.task_id !== undefined) updates.task_id = data!.task_id;
  } else {
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
});

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
