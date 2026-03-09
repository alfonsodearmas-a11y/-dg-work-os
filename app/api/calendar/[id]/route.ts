import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody } from '@/lib/api-utils';
import { updateEvent, deleteEvent, classifyCalendarError } from '@/lib/google-calendar';
import { logger } from '@/lib/logger';

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  start_time: z.string().min(1).optional(),
  end_time: z.string().min(1).optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  all_day: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  add_google_meet: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, updateEventSchema);
  if (error) return error;

  try {
    const { id } = await params;

    const event = await updateEvent(id, {
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
    logger.error({ err }, 'Update calendar event error');
    const classified = classifyCalendarError(err);
    return NextResponse.json(
      { error: 'Failed to update event', _errorType: classified.type, _errorMessage: classified.message },
      { status: classified.type === 'token_expired' ? 401 : 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    await deleteEvent(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete calendar event error');
    const classified = classifyCalendarError(err);
    return NextResponse.json(
      { error: 'Failed to delete event', _errorType: classified.type, _errorMessage: classified.message },
      { status: classified.type === 'token_expired' ? 401 : 500 }
    );
  }
}
