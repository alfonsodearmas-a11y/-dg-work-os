import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/db';
import { listRecentTranscripts } from './client';
import type { FirefliesTranscriptMeta } from './types';
import { logger } from '@/lib/logger';

const POLLER_ID = '00000000-0000-0000-0000-000000000001';
const STALE_LOCK_MS = 5 * 60 * 1000;
const COLD_START_DAYS = 7;

export interface PollResult {
  status: 'ok' | 'lock-not-acquired' | 'fireflies-error';
  observed: number;
  inserted: number;
  queued: number;
  failed: number;
  watermark_used: string | null;
  watermark_advanced_to: string | null;
}

function transcriptDateIso(d: FirefliesTranscriptMeta['date']): string {
  return typeof d === 'number' ? new Date(d).toISOString() : d;
}

function isTranscriptReady(t: FirefliesTranscriptMeta): boolean {
  // Fireflies tenant exposes readiness on meeting_info.summary_status.
  // Treat 'processed' as ready; missing/unknown defaults to ready (the tenant
  // returns null for older records that pre-date the summary feature).
  const status = t.meeting_info?.summary_status?.toLowerCase();
  if (!status) return true;
  return status === 'processed';
}

async function tryAcquireLock(instance: string): Promise<boolean> {
  // Read-then-update. PostgREST applies filter columns to the RETURNING
  // clause too, so chaining `.or('locked_at.is.null,...').update({ locked_at: <now> })`
  // returns an empty array even when the UPDATE succeeded — the post-update
  // row no longer matches `locked_at IS NULL`. We split the read and the
  // write. Race window is ~one round-trip; downstream is idempotent
  // (UNIQUE on meetings_seen.fireflies_meeting_id), so the worst-case of two
  // simultaneous pollers is double Fireflies API spend, not data corruption.
  const { data: cur } = await supabaseAdmin
    .from('polling_state')
    .select('locked_at')
    .eq('id', POLLER_ID)
    .single();
  if (cur?.locked_at) {
    const lockedMs = new Date(cur.locked_at).getTime();
    if (Date.now() - lockedMs < STALE_LOCK_MS) return false;
  }
  const { data } = await supabaseAdmin
    .from('polling_state')
    .update({ locked_at: new Date().toISOString(), locked_by: instance })
    .eq('id', POLLER_ID)
    .select('id');
  return Array.isArray(data) && data.length > 0;
}

async function releaseLock(): Promise<void> {
  await supabaseAdmin
    .from('polling_state')
    .update({ locked_at: null, locked_by: null, last_poll_completed_at: new Date().toISOString() })
    .eq('id', POLLER_ID);
}

export async function runFirefliesPoll(): Promise<PollResult> {
  const instance = randomUUID();
  const got = await tryAcquireLock(instance);
  if (!got) {
    logger.info('action_items_poller: lock not acquired (another run in flight)');
    return { status: 'lock-not-acquired', observed: 0, inserted: 0, queued: 0, failed: 0,
             watermark_used: null, watermark_advanced_to: null };
  }
  try {
    return await pollInner();
  } finally {
    await releaseLock();
  }
}

async function pollInner(): Promise<PollResult> {
  const { data: watermarkRow } = await supabaseAdmin
    .from('meetings_seen')
    .select('transcript_ready_at')
    .order('transcript_ready_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const since = watermarkRow?.transcript_ready_at
    ? new Date(watermarkRow.transcript_ready_at)
    : new Date(Date.now() - COLD_START_DAYS * 24 * 60 * 60 * 1000);

  let metas: FirefliesTranscriptMeta[];
  try {
    metas = await listRecentTranscripts(since);
  } catch (err) {
    await supabaseAdmin.from('failed_extractions').insert({
      fireflies_meeting_id: '<batch>',
      failure_reason: 'other',
      failure_detail: `listTranscripts: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { status: 'fireflies-error', observed: 0, inserted: 0, queued: 0, failed: 1,
             watermark_used: since.toISOString(), watermark_advanced_to: since.toISOString() };
  }

  let inserted = 0, queued = 0, failed = 0;
  let advancedTo = since.toISOString();

  for (const t of metas) {
    const ready = isTranscriptReady(t);
    const dateIso = transcriptDateIso(t.date);

    const row = {
      fireflies_meeting_id: t.id,
      meeting_title: t.title ?? null,
      meeting_date: dateIso,
      detected_type: null,
      detected_modality: null,
      attendee_emails: (t.attendees ?? []).map(a => a.email).filter((e): e is string => !!e),
      transcript_ready_at: ready ? dateIso : null,
      pipeline_action: 'queued' as const,
      skip_reason: ready ? null : 'transcript_not_ready',
    };

    const { data, error } = await supabaseAdmin
      .from('meetings_seen')
      .upsert(row, { onConflict: 'fireflies_meeting_id', ignoreDuplicates: true })
      .select('id');

    if (error) {
      logger.error({ err: error, meetingId: t.id }, 'meetings_seen upsert failed');
      failed++;
      continue;
    }
    if (data && data.length > 0) inserted++;
    queued++;
    if (ready && dateIso > advancedTo) advancedTo = dateIso;
  }

  return { status: 'ok', observed: metas.length, inserted, queued, failed,
           watermark_used: since.toISOString(), watermark_advanced_to: advancedTo };
}
