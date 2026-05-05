import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { ExtractionToolInputZ } from '@/lib/action-items/extraction/types';
import { findUndecidedIndices } from '@/lib/action-items/extraction/decisions';
import { logEvent } from '@/lib/action-items/events';
import { getTranscript } from '@/lib/action-items/fireflies/client';
import { quoteAppearsInTranscript } from '@/lib/action-items/validation/quote-substring';

export const dynamic = 'force-dynamic';

const DecisionZ = z.object({
  index: z.number().int(),
  action: z.enum(['accept', 'reject']),
  edits: z.object({
    task: z.string().optional(),
    verb_category: z.string().optional(),
    owner_user_id: z.string().uuid().optional(),
    due_at: z.string().nullable().optional(),
    due_trigger: z.string().nullable().optional(),
  }).default({}),
  was_edited: z.boolean().default(false),
});
const BodyZ = z.object({ decisions: z.array(DecisionZ) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ extractionId: string }> }) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const { extractionId } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { data: ext } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_id, raw_response, review_status')
    .eq('id', extractionId).maybeSingle();
  if (!ext) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ext.review_status === 'complete') return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });

  const items = ExtractionToolInputZ.safeParse(ext.raw_response);
  if (!items.success) return NextResponse.json({ error: 'Extraction raw_response invalid' }, { status: 500 });

  // Explicit-decision gate. Every extracted item must carry an explicit
  // accept/reject from the reviewer; the prior version silently treated
  // missing entries as rejections, which closed extraction 99049fe3 with
  // 4 rejected / 0 accepted on 2026-05-05 even though the items were
  // good. The submit endpoint now refuses to close an extraction unless
  // all indices are decided. The UI surfaces the undecided count and
  // disables the Submit button accordingly.
  const undecided = findUndecidedIndices(items.data.items.length, parsed.data.decisions);
  if (undecided.length > 0) {
    return NextResponse.json(
      { error: 'Some items have no decision', undecided_indices: undecided, code: 'undecided_items' },
      { status: 400 },
    );
  }

  // Quote re-validation gate (Plan 4 correction #2). Fetch the transcript
  // once, normalize once, then verify every accepted source_quote still
  // appears in it. A fabricated quote stamped into the audit log under a
  // real human's name is much more expensive than one transcript fetch.
  const transcript = await getTranscript(ext.meeting_id as string);
  if (!transcript) {
    return NextResponse.json({ error: 'Transcript unavailable for re-validation' }, { status: 502 });
  }
  const transcriptText = (transcript.sentences ?? [])
    .map(s => `[${s.start_time ?? '?'}] ${s.speaker_name ?? '?'}: ${s.text}`)
    .join('\n');
  for (const d of parsed.data.decisions) {
    if (d.action !== 'accept') continue;
    const raw = items.data.items[d.index];
    if (!raw) continue;
    if (!quoteAppearsInTranscript(raw.source_quote, transcriptText)) {
      return NextResponse.json(
        { error: 'Quote re-validation failed', failing_index: d.index, code: 'quote_fabricated' },
        { status: 400 },
      );
    }
  }

  let accepted = 0, edited = 0, rejected = 0;
  for (const d of parsed.data.decisions) {
    const raw = items.data.items[d.index];
    if (!raw) continue;
    if (d.action === 'reject') { rejected++; continue; }
    accepted++;
    if (d.was_edited) edited++;

    // Resolve owner: must be set (the UI prevents accept of unresolved items via mandatory bucket).
    if (!d.edits.owner_user_id) {
      return NextResponse.json({ error: `Item ${d.index} has no resolved owner` }, { status: 400 });
    }
    const { data: ownerRow } = await supabaseAdmin
      .from('users').select('agency').eq('id', d.edits.owner_user_id).maybeSingle();
    const agency = (ownerRow?.agency as string | null) ?? null;

    const insertPayload = {
      title: d.edits.task ?? raw.task,
      description: null,
      status: 'new',
      priority: 'medium',           // resolution.priority would be re-applied at insert time; default for v1.
      due_date: d.edits.due_at ?? null,
      agency,
      owner_user_id: d.edits.owner_user_id,
      assigned_by_user_id: a.session.user.id,
      source: 'extraction',
      extraction_id: extractionId,
      extraction_item_idx: d.index,
      source_meeting_id: ext.meeting_id,
      source_timestamp: raw.source_timestamp,
      source_quote: raw.source_quote,
      owner_name_raw: raw.owner_name_raw,
      verb_category: (d.edits.verb_category ?? raw.verb_category) as string,
      due_trigger: d.edits.due_trigger ?? null,
      confidence_overall:
        Math.min(raw.confidence_per_field.owner, raw.confidence_per_field.task,
                 raw.confidence_per_field.due, raw.confidence_per_field.quote),
      confidence_reasons: raw.confidence_reasons,
      visibility_scope: 'agency_normal',
    };

    // Idempotent insert: the partial unique index uniq_tasks_extraction_item
    // (migration 105) makes (extraction_id, extraction_item_idx) globally
    // unique among extraction-source tasks. Upsert with ignoreDuplicates
    // turns retries after partial failures into a no-op for items that
    // already landed. See incident 2026-05-05 (extraction 99049fe3).
    const { data: ins, error: insErr } = await supabaseAdmin
      .from('tasks')
      .upsert(insertPayload, { onConflict: 'extraction_id,extraction_item_idx', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();
    if (insErr) return NextResponse.json({ error: `Insert failed at item ${d.index}: ${insErr.message}` }, { status: 500 });
    if (!ins) {
      // Already inserted by a prior submit attempt. Skip the embed call
      // and the logEvent — they fired the first time. Counters still
      // reflect the user's current decision and overwrite at end-of-loop.
      continue;
    }
    const task = ins;

    // Fire-and-forget; embedding failure must not block accept. The drift
    // detector (Plan 5 Task 5) recovers any tasks that fail to embed.
    fetch(`${process.env.NEXTAUTH_URL ?? ''}/api/action-items/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ task_id: task.id }),
    }).catch(() => undefined);

    await logEvent({
      taskId: task.id as string,
      eventType: d.was_edited ? 'edited' : 'accepted',
      actorId: a.session.user.id,
      payload: { extraction_id: extractionId, extraction_item_idx: d.index, was_edited: d.was_edited },
    });
  }

  await supabaseAdmin
    .from('action_item_extractions')
    .update({
      review_status: 'complete',
      reviewed_by: a.session.user.id,
      reviewed_at: new Date().toISOString(),
      items_accepted: accepted,
      items_edited: edited,
      items_rejected: rejected,
    })
    .eq('id', extractionId);

  return NextResponse.json({ accepted, edited, rejected });
}
