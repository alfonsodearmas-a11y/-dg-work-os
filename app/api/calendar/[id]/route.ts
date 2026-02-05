import { NextRequest, NextResponse } from 'next/server';
import { updateEvent, deleteEvent } from '@/lib/google-calendar';

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
      all_day: body.all_day
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error('Update calendar event error:', error);
    return NextResponse.json(
      { error: 'Failed to update event' },
      { status: 500 }
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
  } catch (error) {
    console.error('Delete calendar event error:', error);
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    );
  }
}
