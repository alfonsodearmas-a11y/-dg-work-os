import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { fetchTodayEvents } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  const userId = session.user.id;

  const [tasksResult, eventsResult, notificationsResult] = await Promise.allSettled([
    supabaseAdmin
      .from('tasks')
      .select('id, title, priority, due_date, status, agency')
      .eq('owner_user_id', userId)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(6)
      .then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),

    fetchTodayEvents(userId)
      .then(events =>
        events.slice(0, 5).map(e => ({
          id: e.google_id,
          title: e.title,
          start: e.start_time || '',
          end: e.end_time || '',
          location: e.location || null,
        }))
      )
      .catch(() => []),

    supabaseAdmin
      .from('notifications')
      .select('id, title, body, type, category, created_at, reference_url, reference_type, reference_id, metadata')
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
  ]);

  return NextResponse.json({
    tasks: tasksResult.status === 'fulfilled' ? tasksResult.value : [],
    events: eventsResult.status === 'fulfilled' ? eventsResult.value : [],
    notifications: notificationsResult.status === 'fulfilled' ? notificationsResult.value : [],
  });
}
