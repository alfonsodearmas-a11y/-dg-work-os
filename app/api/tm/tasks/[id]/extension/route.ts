import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, isCEO, canAccessTask, AuthError, authorizeRoles } from '@/lib/auth';
import { getTask, createExtensionRequest, getExtensionRequests } from '@/lib/task-queries';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { extensionRequestedEmail } from '@/lib/task-email-templates';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (!canAccessTask(user, task)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const requests = await getExtensionRequests(id);
    return NextResponse.json({ success: true, data: requests });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    authorizeRoles(user, 'ceo');
    const { id } = await params;
    const task = await getTask(id);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    if (task.assignee_id !== user.id) return NextResponse.json({ success: false, error: 'Not your task' }, { status: 403 });

    const { requested_date, reason } = await request.json();
    if (!requested_date || !reason) return NextResponse.json({ success: false, error: 'requested_date and reason are required' }, { status: 400 });

    const ext = await createExtensionRequest(id, user.id, requested_date, reason);

    // Notify DG
    const dg = await query("SELECT id, full_name, email FROM users WHERE role IN ('director', 'admin') AND is_active = true LIMIT 1");
    if (dg.rows.length > 0) {
      await createTaskNotification(dg.rows[0].id, 'extension_requested', id, `Extension requested: ${task.title}`, reason);
      const emailData = extensionRequestedEmail(dg.rows[0].full_name, { id, title: task.title, agency: task.agency }, user.fullName, requested_date, reason);
      sendTaskEmail(dg.rows[0].email, emailData.subject, emailData.html).catch(() => {});
    }

    return NextResponse.json({ success: true, data: ext }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
