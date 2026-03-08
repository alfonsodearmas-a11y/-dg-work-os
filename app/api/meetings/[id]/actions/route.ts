import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const createActionSchema = z.object({
  task: z.string().min(1),
  owner: z.string().optional(),
  due_date: z.string().optional(),
});

export const POST = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error } = await parseBody(request, createActionSchema);
  if (error) return error;

  const { data: action, error: insertError } = await supabaseAdmin
    .from('meeting_actions')
    .insert({
      meeting_id: id,
      task: data!.task,
      owner: data!.owner || null,
      due_date: data!.due_date || null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ action }, { status: 201 });
});
