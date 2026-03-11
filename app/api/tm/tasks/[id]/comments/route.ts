import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessTask } from '@/lib/auth';
import { requireRole } from '@/lib/auth-helpers';
import { getTask, createComment, getComments } from '@/lib/task-queries';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { commentAddedEmail } from '@/lib/task-email-templates';
import { query } from '@/lib/db-pg';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const createCommentSchema = z.object({
  body: z.string().min(1),
  parent_id: z.string().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const user = { ...authResult.session.user, fullName: authResult.session.user.name, full_name: authResult.session.user.name };

  try {
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const comments = await getComments(id);
    return NextResponse.json({ success: true, data: comments });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const POST = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const user = { ...authResult.session.user, fullName: authResult.session.user.name, full_name: authResult.session.user.name };

  try {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const { data, error: validationError } = await parseBody(request, createCommentSchema);
    if (validationError) return validationError;

    const comment = await createComment(id, user.id, data.body, data.parent_id);

    const notifyUserId = user.id === task.assignee_id ? task.created_by : task.assignee_id;
    const notifyUser = await query('SELECT full_name, email, role FROM users WHERE id = $1', [notifyUserId]);
    if (notifyUser.rows.length > 0) {
      await createTaskNotification(notifyUserId, 'comment_added', id, `New comment on: ${task.title}`, data.body.substring(0, 200));
      const viewPath = `/tasks`;
      const emailData = commentAddedEmail(notifyUser.rows[0].full_name, { id, title: task.title }, user.fullName, data.body.substring(0, 200), viewPath);
      sendTaskEmail(notifyUser.rows[0].email, emailData.subject, emailData.html).catch(() => {});
    }

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error: any) {
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
