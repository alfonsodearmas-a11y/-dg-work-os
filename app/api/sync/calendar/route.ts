import { NextResponse } from 'next/server';
import { fetchWeekEvents } from '@/lib/google-calendar';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
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
    return NextResponse.json(
      { error: 'Calendar sync failed' },
      { status: 500 }
    );
  }
}
