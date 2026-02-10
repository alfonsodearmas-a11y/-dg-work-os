import { NextRequest, NextResponse } from 'next/server';
import { getRecordingById, updateRecordingStatus, updateRecording, createDraftActionItems, getDraftActionItems, deleteRecording } from '@/lib/recording-db';
import { processRecordingTranscript } from '@/lib/recording-processor';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const recording = await getRecordingById(id);
    if (!recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    const actionItems = await getDraftActionItems(id);

    return NextResponse.json({ recording, action_items: actionItems });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const recording = await getRecordingById(id);
    if (!recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Manual transcript submission
    if (body.action === 'submit_transcript' && body.transcript) {
      await updateRecordingStatus(id, 'processing', {
        raw_transcript: body.transcript,
      });

      // Process in background
      processTranscriptBackground(id, body.transcript, recording).catch(err =>
        console.error('[recording-patch] Processing error:', err),
      );

      return NextResponse.json({ status: 'processing' });
    }

    // Retry processing (for failed recordings that have a transcript)
    if (body.action === 'retry') {
      if (!recording.raw_transcript) {
        return NextResponse.json({ error: 'No transcript available to retry' }, { status: 400 });
      }

      await updateRecordingStatus(id, 'processing', { error_message: null });

      processTranscriptBackground(id, recording.raw_transcript, recording).catch(err =>
        console.error('[recording-patch] Retry error:', err),
      );

      return NextResponse.json({ status: 'processing' });
    }

    // Generic field update (title, notes, etc.)
    const allowedFields = ['title', 'meeting_date', 'attendees', 'notes', 'agency', 'duration_seconds', 'recorded_at'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (Object.keys(updates).length > 0) {
      const updated = await updateRecording(id, updates);
      return NextResponse.json({ recording: updated });
    }

    return NextResponse.json({ error: 'No valid action or fields provided' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const recording = await getRecordingById(id);
    if (!recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    await deleteRecording(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function processTranscriptBackground(
  recordingId: string,
  transcript: string,
  recording: { title: string; meeting_date: string | null; attendees: string[]; notes: string | null },
) {
  try {
    const { analysis, tokensUsed } = await processRecordingTranscript(transcript, {
      title: recording.title,
      meeting_date: recording.meeting_date,
      attendees: recording.attendees,
      notes: recording.notes,
    });

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
