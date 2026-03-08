import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateAny, AuthError, authorizeRoles } from '@/lib/auth';
import { bulkCreateTasks } from '@/lib/task-queries';
import { createTaskNotification } from '@/lib/task-notifications';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const bulkCreateSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1),
    assignee_id: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    agency: z.string().min(1),
    due_date: z.string().optional(),
    tags: z.array(z.string()).optional(),
    source_meeting_id: z.string().optional(),
    source_recording_id: z.string().optional(),
  })).min(1),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const { data, error: validationError } = await parseBody(request, bulkCreateSchema);
    if (validationError) return validationError;

    const tasks = await bulkCreateTasks(data.tasks, user.id);

    const assigneeIds = [...new Set(tasks.map(t => t.assignee_id))];
    for (const assigneeId of assigneeIds) {
      const count = tasks.filter(t => t.assignee_id === assigneeId).length;
      await createTaskNotification(assigneeId, 'task_assigned', null, `${count} new task${count > 1 ? 's' : ''} assigned`, `You have been assigned ${count} new task${count > 1 ? 's' : ''}`);
    }

    return NextResponse.json({ success: true, data: { created: tasks.length, tasks } }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
