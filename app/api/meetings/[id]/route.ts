import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  // Two id formats live side by side:
  //   - public.meetings.id is a UUID (legacy meetings module)
  //   - tasks.source_meeting_id holds a Fireflies ULID for extraction-sourced
  //     tasks; the title lives in public.meetings_seen.meeting_title keyed by
  //     `fireflies_meeting_id`.
  // ULIDs are exactly 26 chars and won't validate as UUIDs, so the first
  // .from('meetings').eq('id', id) raises an "invalid input syntax for type
  // uuid" error. Detect the format from the id length and skip the UUID
  // lookup for ULIDs.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (isUuid) {
    const { data: meeting, error } = await supabaseAdmin
      .from('meetings')
      .select('*, meeting_actions(*)')
      .eq('id', id)
      .single();

    if (!error && meeting) {
      return NextResponse.json({ meeting });
    }
  }

  // Fallback: ULID lookup against meetings_seen. Returns a synthetic shape so
  // callers (notably TaskDetailPanel's W23 title resolver) get
  // `meeting.title` consistently.
  const { data: seen } = await supabaseAdmin
    .from('meetings_seen')
    .select('id, fireflies_meeting_id, meeting_title, meeting_date')
    .eq('fireflies_meeting_id', id)
    .maybeSingle();

  if (seen) {
    return NextResponse.json({
      meeting: {
        id: seen.fireflies_meeting_id,
        title: seen.meeting_title,
        meeting_date: seen.meeting_date,
        source: 'meetings_seen',
      },
    });
  }

  return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
}

const patchMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  attendees: z.array(z.string()).optional(),
  transcript_text: z.string().optional(),
  summary: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  ctx?: unknown
) => {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error } = await parseBody(request, patchMeetingSchema);
  if (error) return error;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data!.title !== undefined) updates.title = data!.title;
  if (data!.attendees !== undefined) updates.attendees = data!.attendees;
  if (data!.transcript_text !== undefined) updates.transcript_text = data!.transcript_text;
  if (data!.summary !== undefined) updates.summary = data!.summary;
  if (data!.decisions !== undefined) updates.decisions = data!.decisions;
  if (data!.notes !== undefined) updates.notes = data!.notes;

  const { data: meeting, error: updateError } = await supabaseAdmin
    .from('meetings')
    .update(updates)
    .eq('id', id)
    .select('*, meeting_actions(*)')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  return NextResponse.json({ meeting });
});

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  // Delete audio from storage if exists
  const { data: meeting } = await supabaseAdmin
    .from('meetings')
    .select('audio_path')
    .eq('id', id)
    .single();

  if (meeting?.audio_path) {
    await supabaseAdmin.storage
      .from('meetings-audio')
      .remove([meeting.audio_path]);
  }

  const { error } = await supabaseAdmin
    .from('meetings')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
