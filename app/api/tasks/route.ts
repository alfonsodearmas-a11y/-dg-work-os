import { NextRequest, NextResponse } from 'next/server';
import { fetchAllTasks, createTask, Task } from '@/lib/notion';

export const dynamic = 'force-dynamic';

export type TasksByStatus = {
  'To Do': Task[];
  'In Progress': Task[];
  'Waiting': Task[];
  'Done': Task[];
};

export async function GET() {
  try {
    const tasks = await fetchAllTasks();

    // Group by status
    const grouped: TasksByStatus = {
      'To Do': [],
      'In Progress': [],
      'Waiting': [],
      'Done': []
    };

    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      } else {
        grouped['To Do'].push(task);
      }
    }

    return NextResponse.json({
      tasks: grouped,
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    console.error('Fetch tasks error:', error);
    // Return empty structure so the page still renders
    return NextResponse.json({
      tasks: { 'To Do': [], 'In Progress': [], 'Waiting': [], 'Done': [] },
      lastSync: new Date().toISOString(),
      _error: 'Notion API unavailable'
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const task = await createTask({
      title: body.title,
      status: body.status || 'To Do',
      due_date: body.due_date || null,
      agency: body.agency || null,
      role: body.role || null,
      priority: body.priority || null
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
