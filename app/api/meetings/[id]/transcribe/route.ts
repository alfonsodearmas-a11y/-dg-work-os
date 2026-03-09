import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import OpenAI, { toFile } from 'openai';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 120;

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export const POST = withErrorHandler(async (
  _request: NextRequest,
  ctx?: unknown
) => {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;

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
    logger.info({ meetingId: id, audioPath: meeting.audio_path }, 'Downloading audio for transcription');
    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from('meetings-audio')
      .download(meeting.audio_path);

    if (downloadError || !blob) {
      throw new Error(`Failed to download audio: ${downloadError?.message}`);
    }
    logger.debug({ meetingId: id, size: blob.size, type: blob.type }, 'Audio downloaded');

    // Convert to a File the OpenAI SDK can handle reliably
    const filename = meeting.audio_path.split('/').pop() || 'audio.webm';
    const audioBuffer = Buffer.from(await blob.arrayBuffer());
    const audioFile = await toFile(audioBuffer, filename, { type: blob.type || 'audio/webm' });

    // Call Whisper
    logger.info({ meetingId: id, hasApiKey: !!process.env.OPENAI_API_KEY }, 'Calling Whisper for transcription');
    const transcription = await getOpenAI().audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      response_format: 'verbose_json',
      language: 'en',
    });
    logger.info({ meetingId: id, textLength: transcription.text?.length }, 'Whisper transcription completed');

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
  } catch (err: unknown) {
    const errObj = err as { message?: string; status?: number; code?: string };
    logger.error({ err, meetingId: id, status: errObj.status, code: errObj.code }, 'Transcription failed');

    await supabaseAdmin
      .from('meetings')
      .update({ status: 'ERROR', updated_at: new Date().toISOString() })
      .eq('id', id);

    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
