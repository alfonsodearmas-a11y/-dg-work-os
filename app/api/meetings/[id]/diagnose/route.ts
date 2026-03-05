import { NextRequest, NextResponse } from 'next/server';
import { getMinutesById } from '@/lib/meeting-minutes';

// Diagnostic endpoint: shows stored meeting data (no longer fetches from Notion)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meeting = await getMinutesById(id);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    return NextResponse.json({
      meeting_title: meeting.title,
      meeting_date: meeting.meeting_date,
      attendees: meeting.attendees,
      category: meeting.category,
      status: meeting.status,
      stored_transcript_length: meeting.raw_transcript?.length || 0,
      stored_transcript_preview: meeting.raw_transcript?.slice(0, 500) || null,
      action_items_count: Array.isArray(meeting.action_items) ? meeting.action_items.length : 0,
      has_minutes: !!meeting.minutes_markdown,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Diagnosis failed' },
      { status: 500 }
    );
  }
}
