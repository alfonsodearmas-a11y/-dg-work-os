import { NextRequest, NextResponse } from 'next/server';
import { fetchMonthEvents, fetchWeekEvents, createEvent, classifyCalendarError } from '@/lib/google-calendar';

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
  } catch (err) {
    console.error('Fetch calendar events error:', err);
    const classified = classifyCalendarError(err);

    if (classified.type === 'token_expired' || classified.type === 'invalid_credentials') {
      return NextResponse.json({
        events: [],
        _error: classified.message,
        _errorType: classified.type,
      }, { status: 401 });
    }

    return NextResponse.json({
      events: [],
      _error: classified.message,
      _errorType: classified.type,
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
      all_day: body.all_day,
      attendees: body.attendees,
      add_google_meet: body.add_google_meet,
    });

    return NextResponse.json({ event });
  } catch (err) {
    console.error('Create calendar event error:', err);
    const classified = classifyCalendarError(err);
    return NextResponse.json(
      { error: 'Failed to create event', _errorType: classified.type, _errorMessage: classified.message },
      { status: classified.type === 'token_expired' ? 401 : 500 }
    );
  }
}
