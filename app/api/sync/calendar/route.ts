import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { fetchWeekEvents, classifyCalendarError } from '@/lib/google-calendar';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const events = await fetchWeekEvents();

    // Upsert events
    for (const event of events) {
      await supabaseAdmin
        .from('calendar_events')
        .upsert(
          {
            ...event,
            last_synced: new Date().toISOString()
          },
          { onConflict: 'google_id' }
        );
    }

    return NextResponse.json({
      success: true,
      synced: events.length
    });
  } catch (error) {
    console.error('Calendar sync error:', error);
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
