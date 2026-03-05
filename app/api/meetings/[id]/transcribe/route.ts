import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import OpenAI from 'openai';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  // Fetch meeting
  const { data: meeting, error: fetchError } = await supabaseAdmin
    .from('meetings')
    .select('id, audio_path')
    .eq('id', id)
    .single();

  if (fetchError || !meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  if (!meeting.audio_path) {
    return NextResponse.json({ error: 'No audio file uploaded for this meeting' }, { status: 400 });
  }

  try {
    // Update status to TRANSCRIBING
    await supabaseAdmin
      .from('meetings')
      .update({ status: 'TRANSCRIBING', updated_at: new Date().toISOString() })
      .eq('id', id);

    // Download audio from Supabase Storage
    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from('meetings-audio')
      .download(meeting.audio_path);

    if (downloadError || !blob) {
      throw new Error(`Failed to download audio: ${downloadError?.message}`);
    }

    // Create a File object for the OpenAI API
    const filename = meeting.audio_path.split('/').pop() || 'audio.webm';
    const audioFile = new File([blob], filename, { type: blob.type || 'audio/webm' });

    // Call Whisper
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      response_format: 'verbose_json',
      language: 'en',
    });

    const transcriptText = (transcription.segments ?? [])
      .map((s) => s.text)
      .join(' ')
      .trim() || transcription.text;

    // Update meeting with transcript
    const { error: updateError } = await supabaseAdmin
      .from('meetings')
      .update({
        transcript_raw: JSON.parse(JSON.stringify(transcription)),
        transcript_text: transcriptText,
        status: 'TRANSCRIBED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    return NextResponse.json({ transcriptText });
  } catch (err) {
    console.error('[Meetings Transcribe] Error:', err);

    await supabaseAdmin
      .from('meetings')
      .update({ status: 'ERROR', updated_at: new Date().toISOString() })
      .eq('id', id);

    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
