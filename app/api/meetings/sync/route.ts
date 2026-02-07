import { NextResponse } from 'next/server';
import { syncNewMeetings, processOneMeeting } from '@/lib/meeting-minutes';
import { createTasksFromActionItems } from '@/lib/meeting-tasks';
import { supabaseAdmin } from '@/lib/db';

export async function POST() {
  try {
    // Step 1: Detect new meetings from Notion
    const { newCount, existingCount } = await syncNewMeetings();

    // Step 2: Process up to 3 pending meetings
    const { data: pending } = await supabaseAdmin
      .from('meeting_minutes')
      .select('id')
      .eq('status', 'pending')
      .order('meeting_date', { ascending: false, nullsFirst: false })
      .limit(3);

    const processed: string[] = [];
    const errors: string[] = [];
    let tasksCreated = 0;

    for (const row of pending || []) {
      try {
        const result = await processOneMeeting(row.id);
        processed.push(row.id);

        // Step 3: Create tasks from action items if processing succeeded
        if (result.status === 'completed') {
          try {
            const taskResult = await createTasksFromActionItems(row.id);
            tasksCreated += taskResult.created;
            if (taskResult.errors.length > 0) {
              errors.push(...taskResult.errors.map(e => `task: ${e}`));
            }
          } catch (error: any) {
            errors.push(`tasks for ${row.id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        errors.push(`${row.id}: ${error.message}`);
      }
    }

    return NextResponse.json({
      synced: newCount,
      existing: existingCount,
      processed: processed.length,
      tasksCreated,
      errors,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}
