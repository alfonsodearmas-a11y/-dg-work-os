import { NextRequest, NextResponse } from 'next/server';
import { getMinutesList } from '@/lib/meeting-minutes';
import { supabaseAdmin } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await getMinutesList({ status, limit, offset });

    // Fetch action item summaries for all meetings in one query
    const meetingIds = result.meetings.map(m => m.id);
    let summaryMap: Record<string, { total: number; created: number; completed: number; failed: number }> = {};

    if (meetingIds.length > 0) {
      const { data: links } = await supabaseAdmin
        .from('meeting_action_items')
        .select('meeting_id, status, task_id')
        .in('meeting_id', meetingIds);

      // Get task statuses from cache
      const taskIds = (links || []).filter(l => l.task_id && l.status === 'created').map(l => l.task_id);
      const taskStatusMap = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data: tasks } = await supabaseAdmin
          .from('notion_tasks')
          .select('notion_id, status')
          .in('notion_id', taskIds);
        for (const t of tasks || []) {
          taskStatusMap.set(t.notion_id, t.status);
        }
      }

      // Build summaries
      for (const mid of meetingIds) {
        const meetingLinks = (links || []).filter(l => l.meeting_id === mid);
        const actionItems = result.meetings.find(m => m.id === mid)?.action_items;
        const totalFromJson = Array.isArray(actionItems) ? actionItems.length : 0;
        summaryMap[mid] = {
          total: totalFromJson,
          created: meetingLinks.filter(l => l.status === 'created').length,
          completed: meetingLinks.filter(l => l.status === 'created' && taskStatusMap.get(l.task_id) === 'Done').length,
          failed: meetingLinks.filter(l => l.status === 'failed').length,
        };
      }
    }

    // Attach summaries to meetings
    const enriched = result.meetings.map(m => ({
      ...m,
      task_summary: summaryMap[m.id] || { total: Array.isArray(m.action_items) ? m.action_items.length : 0, created: 0, completed: 0, failed: 0 },
    }));

    return NextResponse.json({ meetings: enriched, total: result.total });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}
