import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessTask } from '@/lib/auth';
import { requireRole } from '@/lib/auth-helpers';
import { getTask, createExtensionRequest, getExtensionRequests } from '@/lib/task-queries';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { extensionRequestedEmail } from '@/lib/task-email-templates';
import { query } from '@/lib/db-pg';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const createExtensionSchema = z.object({
  requested_date: z.string().min(1),
  reason: z.string().min(1),
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
    const requests = await getExtensionRequests(id);
    return NextResponse.json({ success: true, data: requests });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const POST = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  // Any authenticated user can request an extension on their own task
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const user = { ...authResult.session.user, fullName: authResult.session.user.name, full_name: authResult.session.user.name };

  try {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (task.assignee_id !== user.id) return NextResponse.json({ success: false, error: 'Not your task' }, { status: 403 });

    const { data, error: validationError } = await parseBody(request, createExtensionSchema);
    if (validationError) return validationError;

    const ext = await createExtensionRequest(id, user.id, data.requested_date, data.reason);

    const dg = await query("SELECT id, full_name, email FROM users WHERE role IN ('dg', 'agency_admin') AND is_active = true LIMIT 1");
    if (dg.rows.length > 0) {
      await createTaskNotification(dg.rows[0].id, 'extension_requested', id, `Extension requested: ${task.title}`, data.reason);
      const emailData = extensionRequestedEmail(dg.rows[0].full_name, { id, title: task.title, agency: task.agency }, user.fullName, data.requested_date, data.reason);
      sendTaskEmail(dg.rows[0].email, emailData.subject, emailData.html).catch(() => {});
    }

    return NextResponse.json({ success: true, data: ext }, { status: 201 });
  } catch (error: any) {
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
