import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, AuthError } from '@/lib/auth';
import { createTask, getTasksList } from '@/lib/task-queries';

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

    const body = await request.json();
    if (!body.title || !body.assignee_id) {
      return NextResponse.json({ success: false, error: 'title and assignee_id are required' }, { status: 400 });
    }

    // Default agency to 'ministry' if not provided
    const taskData = {
      ...body,
      agency: body.agency || 'ministry',
    };

    const task = await createTask(taskData, user.id);
    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
