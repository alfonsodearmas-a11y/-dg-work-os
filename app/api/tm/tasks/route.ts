import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateAny, AuthError } from '@/lib/auth';
import { createTask, getTasksList } from '@/lib/task-queries';
import { parseBody, apiError, withErrorHandler } from '@/lib/api-utils';

const createTmTaskSchema = z.object({
  title: z.string().min(1),
  assignee_id: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  agency: z.string().optional(),
  due_date: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source_meeting_id: z.string().optional(),
  source_recording_id: z.string().optional(),
});

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

export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    const user = await authenticateAny(request);

    const { data, error: validationError } = await parseBody(request, createTmTaskSchema);
    if (validationError) return validationError;

    const taskData = {
      ...data,
      agency: data.agency || 'ministry',
    };

    const task = await createTask(taskData, user.id);
    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return apiError('INTERNAL_ERROR', error.message, 500);
  }
});
