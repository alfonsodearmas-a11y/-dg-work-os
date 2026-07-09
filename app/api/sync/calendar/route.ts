import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { fetchWeekEvents, classifyCalendarError } from '@/lib/google-calendar';
import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const events = await fetchWeekEvents();

    // Upsert events. The `calendar_events` table only has the columns below;
    // the richer CalendarEvent shape (all_day, attendees, conference_data,
    // color_id, organizer, html_link, status, recurring_event_id) is in-memory
    // only and has no backing columns, so we must NOT spread the whole event
    // (doing so triggers PGRST204 "column not found" on every upsert). Persist
    // only the real columns.
    for (const event of events) {
      await supabaseAdmin
        .from('calendar_events')
        .upsert(
          {
            google_id: event.google_id,
            title: event.title,
            start_time: event.start_time,
            end_time: event.end_time,
            location: event.location,
            description: event.description,
            last_synced: new Date().toISOString(),
          },
          { onConflict: 'google_id' }
        );
    }

    return NextResponse.json({
      success: true,
      synced: events.length
    });
  } catch (error) {
    logger.error({ err: error }, 'Calendar sync failed');
    // Return structured error so the client can distinguish auth vs network issues
    const classified = classifyCalendarError(error);
    const isAuth = classified.type === 'token_expired' || classified.type === 'invalid_credentials';
    return NextResponse.json(
      {
        error: 'Calendar sync failed',
        _errorType: classified.type,
        _errorMessage: classified.message,
        authStatus: isAuth ? 'reauth_required' : undefined,
      },
      { status: isAuth ? 401 : 500 }
    );
  }
}
