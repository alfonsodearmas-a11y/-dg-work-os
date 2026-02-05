import { NextResponse } from 'next/server';
import { fetchTasks, fetchMeetings } from '@/lib/notion';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const [tasks, meetings] = await Promise.all([
      fetchTasks(),
      fetchMeetings()
    ]);

    // Upsert tasks
    for (const task of tasks) {
      await supabaseAdmin
        .from('notion_tasks')
        .upsert(
          {
            ...task,
            last_synced: new Date().toISOString()
          },
          { onConflict: 'notion_id' }
        );
    }

    // Upsert meetings
    for (const meeting of meetings) {
      await supabaseAdmin
        .from('notion_meetings')
        .upsert(
          {
            ...meeting,
            last_synced: new Date().toISOString()
          },
          { onConflict: 'notion_id' }
        );
    }

    return NextResponse.json({
      success: true,
      synced: {
        tasks: tasks.length,
        meetings: meetings.length
      }
    });
  } catch (error) {
    console.error('Notion sync error:', error);
    return NextResponse.json(
      { error: 'Notion sync failed' },
      { status: 500 }
    );
  }
}
