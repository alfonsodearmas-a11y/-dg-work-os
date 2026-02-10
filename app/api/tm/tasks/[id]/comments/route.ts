import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, canAccessTask, AuthError } from '@/lib/auth';
import { getTask, createComment, getComments } from '@/lib/task-queries';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { commentAddedEmail } from '@/lib/task-email-templates';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const comments = await getComments(id);
    return NextResponse.json({ success: true, data: comments });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const { body: commentBody, parent_id } = await request.json();
    if (!commentBody?.trim()) return NextResponse.json({ success: false, error: 'Comment body is required' }, { status: 400 });

    const comment = await createComment(id, user.id, commentBody, parent_id);

    // Notify the other party
    const notifyUserId = user.id === task.assignee_id ? task.created_by : task.assignee_id;
    const notifyUser = await query('SELECT full_name, email, role FROM users WHERE id = $1', [notifyUserId]);
    if (notifyUser.rows.length > 0) {
      await createTaskNotification(notifyUserId, 'comment_added', id, `New comment on: ${task.title}`, commentBody.substring(0, 200));
      const viewPath = notifyUser.rows[0].role === 'ceo' ? `/dashboard/tasks/${id}` : `/admin/tasks/${id}`;
      const emailData = commentAddedEmail(notifyUser.rows[0].full_name, { id, title: task.title }, user.fullName, commentBody.substring(0, 200), viewPath);
      sendTaskEmail(notifyUser.rows[0].email, emailData.subject, emailData.html).catch(() => {});
    }

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
