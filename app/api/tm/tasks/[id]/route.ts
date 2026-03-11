import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateAny, canAccessTask, AuthError } from '@/lib/auth';
import { getTask, updateTask, updateTaskStatus, validateTransition, deleteTask } from '@/lib/task-queries';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const patchTmTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['new', 'active', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  due_date: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  assignee_id: z.string().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    return NextResponse.json({ success: true, data: task });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const PATCH = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  try {
    const user = await authenticateAny(request);
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const { data, error: validationError } = await parseBody(request, patchTmTaskSchema);
    if (validationError) return validationError;

    if (data.status && data.status !== task.status) {
      if (!validateTransition(task.status, data.status)) {
        return NextResponse.json({ success: false, error: `Invalid status: ${data.status}` }, { status: 400 });
      }

      const updated = await updateTaskStatus(id, data.status, user.id);
      return NextResponse.json({ success: true, data: updated });
    }

    const fieldUpdates: any = {};
    if (data.title !== undefined) fieldUpdates.title = data.title;
    if (data.description !== undefined) fieldUpdates.description = data.description;
    if (data.priority !== undefined) fieldUpdates.priority = data.priority;
    if (data.due_date !== undefined) fieldUpdates.due_date = data.due_date;
    if (data.tags !== undefined) fieldUpdates.tags = data.tags;
    if (data.assignee_id !== undefined) fieldUpdates.assignee_id = data.assignee_id;

    if (Object.keys(fieldUpdates).length === 0) {
      return NextResponse.json({ success: true, data: task });
    }

    const updated = await updateTask(id, fieldUpdates, user.id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    await deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
