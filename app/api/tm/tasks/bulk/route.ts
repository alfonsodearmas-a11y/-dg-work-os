import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, AuthError, authorizeRoles } from '@/lib/auth';
import { bulkCreateTasks } from '@/lib/task-queries';
import { createTaskNotification } from '@/lib/task-notifications';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const { tasks: items } = await request.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'tasks array is required' }, { status: 400 });
    }

    const tasks = await bulkCreateTasks(items, user.id);

    // Notify each unique assignee
    const assigneeIds = [...new Set(tasks.map(t => t.assignee_id))];
    for (const assigneeId of assigneeIds) {
      const count = tasks.filter(t => t.assignee_id === assigneeId).length;
      await createTaskNotification(assigneeId, 'task_assigned', null, `${count} new task${count > 1 ? 's' : ''} assigned`, `You have been assigned ${count} new task${count > 1 ? 's' : ''}`);
    }

    return NextResponse.json({ success: true, data: { created: tasks.length, tasks } }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
