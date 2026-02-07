import { NextRequest, NextResponse } from 'next/server';
import { fetchMonthEvents, fetchWeekEvents, createEvent } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let events;
    if (year && month) {
      events = await fetchMonthEvents(parseInt(year), parseInt(month));
    } else {
      events = await fetchWeekEvents();
    }

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Fetch calendar events error:', error);
    // Return empty structure so the page still renders
    return NextResponse.json({
      events: [],
      _error: 'Google Calendar API unavailable'
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.title || !body.start_time || !body.end_time) {
      return NextResponse.json(
        { error: 'Title, start_time, and end_time are required' },
        { status: 400 }
      );
    }

    const event = await createEvent({
      title: body.title,
      start_time: body.start_time,
      end_time: body.end_time,
      location: body.location,
      description: body.description,
      all_day: body.all_day
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error('Create calendar event error:', error);
    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    );
  }
}
