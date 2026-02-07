import { NextRequest, NextResponse } from 'next/server';
import { updateEvent, deleteEvent, classifyCalendarError } from '@/lib/google-calendar';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const event = await updateEvent(id, {
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
    console.error('Update calendar event error:', err);
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
  try {
    const { id } = await params;

    await deleteEvent(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete calendar event error:', err);
    const classified = classifyCalendarError(err);
    return NextResponse.json(
      { error: 'Failed to delete event', _errorType: classified.type, _errorMessage: classified.message },
      { status: classified.type === 'token_expired' ? 401 : 500 }
    );
  }
}
