import { NextRequest, NextResponse } from 'next/server';
import { getMinutesById, updateMinutes, processOneMeeting } from '@/lib/meeting-minutes';
import { createTasksFromActionItems, getActionItemsWithStatus, retryFailedActionItems } from '@/lib/meeting-tasks';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meeting = await getMinutesById(id);

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Enrich with linked action item status
    const linkedItems = await getActionItemsWithStatus(id);

    return NextResponse.json({ ...meeting, linked_action_items: linkedItems });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch meeting' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.minutes_markdown !== undefined) {
      const updated = await updateMinutes(id, body.minutes_markdown);
      return NextResponse.json(updated);
    }

    if (body.action === 'process') {
      const result = await processOneMeeting(id);
      // Also create tasks if processing succeeded
      if (result.status === 'completed') {
        try {
          await createTasksFromActionItems(id);
        } catch { /* task creation is best-effort */ }
      }
      const linkedItems = await getActionItemsWithStatus(id);
      return NextResponse.json({ ...result, linked_action_items: linkedItems });
    }

    if (body.action === 'create_tasks') {
      const taskResult = await createTasksFromActionItems(id);
      const linkedItems = await getActionItemsWithStatus(id);
      return NextResponse.json({ taskResult, linked_action_items: linkedItems });
    }

    if (body.action === 'retry_tasks') {
      const taskResult = await retryFailedActionItems(id);
      const linkedItems = await getActionItemsWithStatus(id);
      return NextResponse.json({ taskResult, linked_action_items: linkedItems });
    }

    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update meeting' },
      { status: 500 }
    );
  }
}
