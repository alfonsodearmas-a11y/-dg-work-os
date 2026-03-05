import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  // Meetings this week
  const { data: weekMeetings, error: weekErr } = await supabaseAdmin
    .from('meetings')
    .select('id, title')
    .gte('date', startOfWeek.toISOString())
    .lt('date', endOfWeek.toISOString());

  if (weekErr) {
    return NextResponse.json({ error: weekErr.message }, { status: 500 });
  }

  // Open action items due this week (with meeting title)
  const { data: actions, error: actionsErr } = await supabaseAdmin
    .from('meeting_actions')
    .select('id, task, due_date, meeting_id, meetings(title)')
    .eq('done', false)
    .gte('due_date', startOfWeek.toISOString().split('T')[0])
    .lte('due_date', endOfWeek.toISOString().split('T')[0])
    .order('due_date', { ascending: true })
    .limit(3);

  if (actionsErr) {
    return NextResponse.json({ error: actionsErr.message }, { status: 500 });
  }

  // NEEDS_REVIEW items across recent meetings (last 30 days)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const { data: reviewItems, error: reviewErr } = await supabaseAdmin
    .from('meeting_actions')
    .select('id, task, meeting_id, review_reason, meetings(id, title)')
    .eq('confidence', 'NEEDS_REVIEW')
    .eq('done', false)
    .eq('skipped', false)
    .is('task_id', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (reviewErr) {
    return NextResponse.json({ error: reviewErr.message }, { status: 500 });
  }

  // Group review items by meeting
  const reviewByMeeting: Record<string, { meeting_id: string; meeting_title: string; count: number }> = {};
  for (const item of reviewItems || []) {
    const mid = item.meeting_id;
    if (!reviewByMeeting[mid]) {
      const meetingData = item.meetings as unknown as { id: string; title: string } | null;
      reviewByMeeting[mid] = {
        meeting_id: mid,
        meeting_title: meetingData?.title ?? 'Untitled',
        count: 0,
      };
    }
    reviewByMeeting[mid].count++;
  }

  return NextResponse.json({
    meetingsThisWeek: weekMeetings?.length ?? 0,
    actions: (actions || []).map((a: Record<string, unknown>) => ({
      id: a.id,
      task: a.task,
      due_date: a.due_date,
      meeting_title: (a.meetings as { title: string } | null)?.title ?? null,
    })),
    needsReview: {
      total: reviewItems?.length ?? 0,
      byMeeting: Object.values(reviewByMeeting),
    },
  });
}
