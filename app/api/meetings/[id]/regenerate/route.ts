import { NextRequest, NextResponse } from 'next/server';
import { regenerateMinutes } from '@/lib/meeting-minutes';
import { unlinkActionItems, createTasksFromActionItems, getActionItemsWithStatus } from '@/lib/meeting-tasks';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Unlink existing action items (don't delete the Notion tasks, just unlink)
    await unlinkActionItems(id);

    // Regenerate minutes
    const result = await regenerateMinutes(id);

    // Create tasks from new action items if regeneration succeeded
    if (result.status === 'completed') {
      try {
        await createTasksFromActionItems(id);
      } catch { /* task creation is best-effort */ }
    }

    const linkedItems = await getActionItemsWithStatus(id);
    return NextResponse.json({ ...result, linked_action_items: linkedItems });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to regenerate minutes' },
      { status: 500 }
    );
  }
}
