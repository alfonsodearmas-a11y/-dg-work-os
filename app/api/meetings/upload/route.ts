import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { createRecording, updateRecordingStatus, createDraftActionItems } from '@/lib/recording-db';
import { uploadAudio } from '@/lib/scriberr';
import { processRecordingTranscript } from '@/lib/recording-processor';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const title = formData.get('title') as string;
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const meetingDate = formData.get('meeting_date') as string | null;
    const attendeesRaw = formData.get('attendees') as string | null;
    const attendees = attendeesRaw ? attendeesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const notes = formData.get('notes') as string | null;
    const transcript = formData.get('transcript') as string | null;
    const audioFile = formData.get('audio') as File | null;

    // Manual transcript path (no audio)
    if (transcript && !audioFile) {
      const recording = await createRecording({
        title,
        meeting_date: meetingDate,
        attendees,
        notes,
        status: 'processing',
      });

      // Process in background
      processManualTranscript(recording.id, transcript, {
        title,
        meeting_date: meetingDate,
        attendees,
        notes,
      }).catch(err => console.error('[upload] Manual transcript processing error:', err));

      return NextResponse.json({ id: recording.id, status: 'processing' });
    }

    // Audio upload path
    if (!audioFile) {
      return NextResponse.json({ error: 'Either audio file or transcript is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const filename = `${Date.now()}-${audioFile.name}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('recordings')
      .upload(filename, buffer, { contentType: audioFile.type });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    // Try Scriberr
    let scriberrId: string | null = null;
    let initialStatus: 'transcribing' | 'uploading' = 'uploading';

    try {
      const result = await uploadAudio(buffer, audioFile.name, audioFile.type);
      scriberrId = result.id;
      initialStatus = 'transcribing';
    } catch (scriberrErr: any) {
      console.warn('[upload] Scriberr unavailable, audio stored for manual transcript:', scriberrErr.message);
    }

    const recording = await createRecording({
      title,
      meeting_date: meetingDate,
      attendees,
      notes,
      audio_file_path: filename,
      audio_filename: audioFile.name,
      audio_mime_type: audioFile.type,
      audio_file_size: audioFile.size,
      scriberr_id: scriberrId,
      status: initialStatus,
    });

    return NextResponse.json({
      id: recording.id,
      status: recording.status,
      scriberr_available: !!scriberrId,
    });
  } catch (err: any) {
    console.error('[upload] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function processManualTranscript(
  recordingId: string,
  transcript: string,
  context: { title: string; meeting_date: string | null; attendees: string[]; notes: string | null },
) {
  try {
    await updateRecordingStatus(recordingId, 'processing', {
      raw_transcript: transcript,
    });

    const { analysis, tokensUsed } = await processRecordingTranscript(transcript, context);

    await updateRecordingStatus(recordingId, 'completed', {
      analysis,
      ai_model: 'claude-opus-4-6',
      ai_tokens_used: tokensUsed,
      error_message: null,
    });

    await createDraftActionItems(recordingId, analysis.action_items);
  } catch (err: any) {
    await updateRecordingStatus(recordingId, 'failed', {
      error_message: err.message || 'Processing failed',
    });
  }
}
