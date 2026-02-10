import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, isDG, canAccessTask, AuthError } from '@/lib/auth';
import { getTask, updateTask, updateTaskStatus, validateTransition } from '@/lib/task-queries';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { taskSubmittedEmail, taskRejectedEmail } from '@/lib/task-email-templates';
import { query } from '@/lib/db-pg';

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

    // Status change
    if (body.status && body.status !== task.status) {
      if (!validateTransition(task.status, body.status, user.role)) {
        return NextResponse.json({ success: false, error: `Invalid transition from ${task.status} to ${body.status}` }, { status: 400 });
      }

      const updated = await updateTaskStatus(id, body.status, user.id, {
        rejection_reason: body.rejection_reason,
        completion_notes: body.completion_notes,
        evidence: body.evidence,
      });

      // Notifications
      if (body.status === 'submitted') {
        // Notify DG
        const dg = await query("SELECT id, full_name, email FROM users WHERE role IN ('director', 'admin') AND is_active = true LIMIT 1");
        if (dg.rows.length > 0) {
          await createTaskNotification(dg.rows[0].id, 'task_submitted', id, `Task submitted: ${task.title}`, `${user.fullName} submitted "${task.title}" for review`);
          const emailData = taskSubmittedEmail(dg.rows[0].full_name, { id, title: task.title, agency: task.agency }, user.fullName);
          sendTaskEmail(dg.rows[0].email, emailData.subject, emailData.html).catch(() => {});
        }
      } else if (body.status === 'rejected') {
        await createTaskNotification(task.assignee_id, 'task_rejected', id, `Task returned: ${task.title}`, body.rejection_reason || 'Needs revision');
        const assignee = await query('SELECT full_name, email FROM users WHERE id = $1', [task.assignee_id]);
        if (assignee.rows.length > 0) {
          const emailData = taskRejectedEmail(assignee.rows[0].full_name, { id, title: task.title, agency: task.agency }, body.rejection_reason);
          sendTaskEmail(assignee.rows[0].email, emailData.subject, emailData.html).catch(() => {});
        }
      } else if (body.status === 'verified') {
        await createTaskNotification(task.assignee_id, 'task_verified', id, `Task verified: ${task.title}`, 'The DG has verified your completed task');
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // Field updates (DG only for most fields)
    const fieldUpdates: any = {};
    if (body.title !== undefined) fieldUpdates.title = body.title;
    if (body.description !== undefined) fieldUpdates.description = body.description;
    if (body.priority !== undefined) fieldUpdates.priority = body.priority;
    if (body.due_date !== undefined) fieldUpdates.due_date = body.due_date;
    if (body.tags !== undefined) fieldUpdates.tags = body.tags;
    if (body.assignee_id !== undefined && isDG(user)) {
      fieldUpdates.assignee_id = body.assignee_id;
      // Notify new assignee
      const newAssignee = await query('SELECT full_name, email FROM users WHERE id = $1', [body.assignee_id]);
      if (newAssignee.rows.length > 0) {
        await createTaskNotification(body.assignee_id, 'task_assigned', id, `Task assigned: ${task.title}`, `You've been assigned "${task.title}"`);
      }
    }

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
