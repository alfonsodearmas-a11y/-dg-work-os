import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, isDG, AuthError, authorizeRoles } from '@/lib/auth';
import { createTask, getTasksList } from '@/lib/task-queries';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { taskAssignedEmail } from '@/lib/task-email-templates';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateAny(request);
    const url = request.nextUrl;

    const filters: any = {};
    if (url.searchParams.get('status')) {
      const s = url.searchParams.get('status')!;
      filters.status = s.includes(',') ? s.split(',') : s;
    }
    if (url.searchParams.get('priority')) filters.priority = url.searchParams.get('priority');
    if (url.searchParams.get('agency')) filters.agency = url.searchParams.get('agency');
    if (url.searchParams.get('assignee_id')) filters.assignee_id = url.searchParams.get('assignee_id');
    if (url.searchParams.get('search')) filters.search = url.searchParams.get('search');
    if (url.searchParams.get('due_before')) filters.due_before = url.searchParams.get('due_before');
    if (url.searchParams.get('due_after')) filters.due_after = url.searchParams.get('due_after');
    if (url.searchParams.get('limit')) filters.limit = parseInt(url.searchParams.get('limit')!);
    if (url.searchParams.get('offset')) filters.offset = parseInt(url.searchParams.get('offset')!);
    if (url.searchParams.get('sort_by')) filters.sort_by = url.searchParams.get('sort_by');
    if (url.searchParams.get('sort_dir')) filters.sort_dir = url.searchParams.get('sort_dir');

    const result = await getTasksList(filters, user.id, user.role);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const body = await request.json();
    if (!body.title || !body.agency || !body.assignee_id) {
      return NextResponse.json({ success: false, error: 'title, agency, and assignee_id are required' }, { status: 400 });
    }

    const task = await createTask(body, user.id);

    // Notify assignee
    const assignee = await query('SELECT full_name, email FROM users WHERE id = $1', [task.assignee_id]);
    if (assignee.rows.length > 0) {
      const { full_name, email } = assignee.rows[0];
      await createTaskNotification(task.assignee_id, 'task_assigned', task.id, `New task: ${task.title}`, `You've been assigned "${task.title}"`);
      const emailData = taskAssignedEmail(full_name, { id: task.id, title: task.title, agency: task.agency, due_date: task.due_date, priority: task.priority });
      sendTaskEmail(email, emailData.subject, emailData.html).catch(() => {});
    }

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
