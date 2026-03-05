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

  return NextResponse.json({
    meetingsThisWeek: weekMeetings?.length ?? 0,
    actions: (actions || []).map((a: Record<string, unknown>) => ({
      id: a.id,
      task: a.task,
      due_date: a.due_date,
      meeting_title: (a.meetings as { title: string } | null)?.title ?? null,
    })),
  });
}
