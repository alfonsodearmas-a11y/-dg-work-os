import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, apiError } from '@/lib/api-utils';
import { fetchMonthEvents, fetchWeekEvents, createEvent, classifyCalendarError } from '@/lib/google-calendar';
import { logger } from '@/lib/logger';

const createEventSchema = z.object({
  title: z.string().min(1),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  location: z.string().optional(),
  description: z.string().optional(),
  all_day: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  add_google_meet: z.boolean().optional(),
});

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

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
    logger.error({ err }, 'Fetch calendar events error');
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
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, createEventSchema);
  if (error) return error;

  try {
    const event = await createEvent({
      title: data.title,
      start_time: data.start_time,
      end_time: data.end_time,
      location: data.location,
      description: data.description,
      all_day: data.all_day,
      attendees: data.attendees,
      add_google_meet: data.add_google_meet,
    });

    return NextResponse.json({ event });
  } catch (err) {
    logger.error({ err }, 'Create calendar event error');
    const classified = classifyCalendarError(err);
    return NextResponse.json(
      { error: 'Failed to create event', _errorType: classified.type, _errorMessage: classified.message },
      { status: classified.type === 'token_expired' ? 401 : 500 }
    );
  }
}
