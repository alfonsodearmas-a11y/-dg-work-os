import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';
import { createTaskNotification, sendTaskEmail } from '@/lib/task-notifications';
import { taskReminderEmail } from '@/lib/task-email-templates';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await query(
      `SELECT t.*, u.full_name AS assignee_name, u.email AS assignee_email
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
       WHERE t.status NOT IN ('verified', 'overdue')
         AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 days'`
    );

    let sent = 0;
    for (const task of result.rows) {
      await createTaskNotification(task.assignee_id, 'task_reminder', task.id, `Reminder: ${task.title} due soon`, `Due ${task.due_date}`);
      const emailData = taskReminderEmail(task.assignee_name, { id: task.id, title: task.title, agency: task.agency, due_date: task.due_date });
      const ok = await sendTaskEmail(task.assignee_email, emailData.subject, emailData.html);
      if (ok) sent++;
    }

    return NextResponse.json({ success: true, data: { checked: result.rowCount, sent } });
  } catch (error: any) {
    console.error('[cron/reminders] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
