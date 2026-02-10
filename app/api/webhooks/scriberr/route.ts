import { NextRequest, NextResponse } from 'next/server';
import { getRecordingByScriberrId, updateRecordingStatus, createDraftActionItems } from '@/lib/recording-db';
import { getTranscript } from '@/lib/scriberr';
import { processRecordingTranscript } from '@/lib/recording-processor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id: scriberrId, status, error } = body;

    if (!scriberrId) {
      return NextResponse.json({ error: 'Missing transcription id' }, { status: 400 });
    }

    const recording = await getRecordingByScriberrId(scriberrId);
    if (!recording) {
      console.warn(`[scriberr-webhook] No recording found for scriberr_id: ${scriberrId}`);
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    if (status === 'failed') {
      await updateRecordingStatus(recording.id, 'failed', {
        error_message: error || 'Scriberr transcription failed',
      });
      return NextResponse.json({ ok: true });
    }

    if (status === 'completed') {
      // Fetch transcript from Scriberr
      const transcript = await getTranscript(scriberrId);

      await updateRecordingStatus(recording.id, 'processing', {
        raw_transcript: transcript.text,
        speaker_labels: transcript.speakers || [],
      });

      // Process with Claude
      try {
        const { analysis, tokensUsed } = await processRecordingTranscript(transcript.text, {
          title: recording.title,
          meeting_date: recording.meeting_date,
          attendees: recording.attendees,
          notes: recording.notes,
        });

        // Save analysis and create draft items
        await updateRecordingStatus(recording.id, 'completed', {
          analysis,
          ai_model: 'claude-opus-4-6',
          ai_tokens_used: tokensUsed,
          error_message: null,
        });

        await createDraftActionItems(recording.id, analysis.action_items);
      } catch (procErr: any) {
        await updateRecordingStatus(recording.id, 'failed', {
          error_message: `Processing failed: ${procErr.message}`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[scriberr-webhook] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
