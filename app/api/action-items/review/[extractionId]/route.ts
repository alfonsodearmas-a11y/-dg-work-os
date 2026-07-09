import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
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
  const a = await requireRole(['superadmin']);
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
    console.error('[review-submit] undecided_items', {
      extraction_id: extractionId,
      undecided_zero_idx: undecided,
      decisions_total: parsed.data.decisions.length,
      items_total: items.data.items.length,
    });
    const humanPositions = undecided.map(i => i + 1).join(', ');
    return NextResponse.json(
      {
        error: `${undecided.length} item${undecided.length === 1 ? '' : 's'} have no decision (item${undecided.length === 1 ? '' : 's'} ${humanPositions}) — accept or reject before submitting`,
        undecided_indices: undecided,
        human_positions: undecided.map(i => i + 1),
        code: 'undecided_items',
      },
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

    // Resolve owner: must be set on every accepted item. The strict resolver
    // (post-2026-05-05) returns null instead of fuzzy-matching, so the
    // reviewer must explicitly pick an owner via the dropdown before
    // accepting. Differentiate from the undecided-items 400 above.
    if (!d.edits.owner_user_id) {
      const taskExcerpt = raw.task.length > 60 ? raw.task.slice(0, 60) + '…' : raw.task;
      const ownerNameRaw = raw.owner_name_raw || '(no name spoken)';
      console.error('[review-submit] accepted_without_owner', {
        extraction_id: extractionId,
        zero_idx: d.index,
        human_position: d.index + 1,
        decision: d,
        owner_name_raw: raw.owner_name_raw,
        task_excerpt: taskExcerpt,
        decisions_total: parsed.data.decisions.length,
        items_total: items.data.items.length,
      });
      return NextResponse.json({
        error: `Item ${d.index + 1} ("${taskExcerpt}") is set to accept but the resolver could not match owner "${ownerNameRaw}" — pick an owner manually or reject the item`,
        failing_index: d.index,
        human_position: d.index + 1,
        owner_name_raw: raw.owner_name_raw,
        code: 'accepted_without_owner',
      }, { status: 400 });
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

    // Idempotent insert. Postgres partial-index inference in ON CONFLICT
    // requires the matching WHERE clause on the INSERT, which supabase-js's
    // .upsert() can't emit (it only sends a column tuple). Earlier attempt
    // with .upsert({ onConflict: 'extraction_id,extraction_item_idx' })
    // failed against migration 105's partial index on 2026-05-05.
    //
    // Fallback: pre-check via SELECT, then INSERT. The migration-105 index
    // still backstops concurrent races at the DB layer — if a true race
    // happens, the second INSERT raises 23505 (unique_violation) and we
    // treat it as already-landed.
    const { data: existing } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('extraction_id', extractionId)
      .eq('extraction_item_idx', d.index)
      .maybeSingle();
    if (existing) {
      // Already inserted by a prior submit attempt. Skip embed + logEvent
      // — they fired the first time. Counters still reflect the user's
      // current decision and overwrite at end-of-loop.
      continue;
    }
    const { data: ins, error: insErr } = await supabaseAdmin
      .from('tasks')
      .insert(insertPayload)
      .select('id')
      .single();
    if (insErr) {
      if (insErr.code === '23505') continue;   // race-lost: another writer landed it.
      return NextResponse.json({ error: `Insert failed at item ${d.index}: ${insErr.message}` }, { status: 500 });
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
