import { NextRequest, NextResponse } from 'next/server';
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
    const agency = formData.get('agency') as string | null;
    const durationStr = formData.get('duration_seconds') as string | null;
    const durationSeconds = durationStr ? parseInt(durationStr, 10) || null : null;
    const recordedAt = formData.get('recorded_at') as string | null;

    // Manual transcript path (no audio)
    if (transcript && !audioFile) {
      const recording = await createRecording({
        title,
        meeting_date: meetingDate,
        attendees,
        notes,
        agency,
        duration_seconds: durationSeconds,
        recorded_at: recordedAt,
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

    // Audio upload path — no storage, pipe to Scriberr then discard
    if (!audioFile) {
      return NextResponse.json({ error: 'Either audio file or transcript is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // Try Scriberr — audio is transient, not stored
    let scriberrId: string | null = null;
    let initialStatus: 'transcribing' | 'uploading' = 'uploading';

    try {
      const result = await uploadAudio(buffer, audioFile.name, audioFile.type);
      scriberrId = result.id;
      initialStatus = 'transcribing';
    } catch (scriberrErr: any) {
      console.warn('[upload] Scriberr unavailable, audio discarded. Paste transcript manually:', scriberrErr.message);
    }

    const recording = await createRecording({
      title,
      meeting_date: meetingDate,
      attendees,
      notes,
      agency,
      duration_seconds: durationSeconds,
      recorded_at: recordedAt,
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
