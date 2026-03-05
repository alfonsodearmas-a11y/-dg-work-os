import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  const { data: meeting, error } = await supabaseAdmin
    .from('meetings')
    .select('*, meeting_actions(*)')
    .eq('id', id)
    .single();

  if (error || !meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  return NextResponse.json({ meeting });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.attendees !== undefined) updates.attendees = body.attendees;
  if (body.transcript_text !== undefined) updates.transcript_text = body.transcript_text;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.decisions !== undefined) updates.decisions = body.decisions;
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data: meeting, error } = await supabaseAdmin
    .from('meetings')
    .update(updates)
    .eq('id', id)
    .select('*, meeting_actions(*)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  return NextResponse.json({ meeting });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
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
