import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { taskOverdueEmail } from '@/lib/task-email-templates';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find overdue tasks
    const result = await query(
      `UPDATE tasks SET status = 'overdue'
       WHERE status NOT IN ('verified', 'overdue')
         AND due_date < CURRENT_DATE
       RETURNING *`
    );

    let notified = 0;
    for (const task of result.rows) {
      // Create activity
      await query(
        `INSERT INTO task_activities (task_id, action, from_value, to_value)
         VALUES ($1, 'status_changed', $2, 'overdue')`,
        [task.id, task.status]
      );

      // Notify assignee
      const assignee = await query('SELECT full_name, email FROM users WHERE id = $1', [task.assignee_id]);
      if (assignee.rows.length > 0) {
        await createTaskNotification(task.assignee_id, 'task_overdue', task.id, `OVERDUE: ${task.title}`, 'This task is now past its deadline');
        const emailData = taskOverdueEmail(assignee.rows[0].full_name, { id: task.id, title: task.title, agency: task.agency, due_date: task.due_date });
        sendTaskEmail(assignee.rows[0].email, emailData.subject, emailData.html).catch(() => {});
        notified++;
      }
    }

    return NextResponse.json({ success: true, data: { marked: result.rowCount, notified } });
  } catch (error: any) {
    console.error('[cron/overdue] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
