import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const bulkPatchSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
  updates: z.object({
    due_date: z.string().nullable().optional(),
    assignee_id: z.string().optional(),
    agency: z.string().optional(),
    status: z.enum(['new', 'active', 'blocked', 'done']).optional(),
    blocked_reason: z.string().optional(),
  }),
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return result;

  const { data, error: validationError } = await parseBody(request, bulkPatchSchema);
  if (validationError) return validationError;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.updates.due_date !== undefined) updatePayload.due_date = data.updates.due_date;
  if (data.updates.assignee_id !== undefined) updatePayload.owner_user_id = data.updates.assignee_id;
  if (data.updates.agency !== undefined) updatePayload.agency = data.updates.agency;
  if (data.updates.status !== undefined) {
    updatePayload.status = data.updates.status;
    if (data.updates.status === 'done') {
      updatePayload.completed_at = new Date().toISOString();
    } else {
      updatePayload.completed_at = null;
    }
    if (data.updates.status === 'blocked' && data.updates.blocked_reason) {
      updatePayload.blocked_reason = data.updates.blocked_reason;
    }
    if (data.updates.status !== 'blocked') {
      updatePayload.blocked_reason = null;
    }
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .update(updatePayload)
    .in('id', data.taskIds);

  if (error) {
    return apiError('DB_ERROR', error.message, 500);
  }

  return NextResponse.json({ success: true });
});

export async function DELETE(request: NextRequest) {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  const body = await request.json();
  const { taskIds } = body;

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ error: 'No tasks provided' }, { status: 400 });
  }

  if (taskIds.length > 100) {
    return apiError('LIMIT_EXCEEDED', 'Maximum 100 tasks per bulk operation', 400);
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
