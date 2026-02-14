import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, canAccessTask, AuthError } from '@/lib/auth';
import { getTask, updateTask, updateTaskStatus, validateTransition, deleteTask } from '@/lib/task-queries';

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const body = await request.json();

    // Status change — any valid status to any other valid status
    if (body.status && body.status !== task.status) {
      if (!validateTransition(task.status, body.status)) {
        return NextResponse.json({ success: false, error: `Invalid status: ${body.status}` }, { status: 400 });
      }

      const updated = await updateTaskStatus(id, body.status, user.id);
      return NextResponse.json({ success: true, data: updated });
    }

    // Field updates
    const fieldUpdates: any = {};
    if (body.title !== undefined) fieldUpdates.title = body.title;
    if (body.description !== undefined) fieldUpdates.description = body.description;
    if (body.priority !== undefined) fieldUpdates.priority = body.priority;
    if (body.due_date !== undefined) fieldUpdates.due_date = body.due_date;
    if (body.tags !== undefined) fieldUpdates.tags = body.tags;
    if (body.assignee_id !== undefined) fieldUpdates.assignee_id = body.assignee_id;

    if (Object.keys(fieldUpdates).length === 0) {
      return NextResponse.json({ success: true, data: task });
    }

    const updated = await updateTask(id, fieldUpdates, user.id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

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
