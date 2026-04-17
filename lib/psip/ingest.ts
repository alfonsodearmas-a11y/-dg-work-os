// ── PSIP ingest orchestrator ──────────────────────────────────────────────────
//
// Two-phase: preview (no writes to `tender`) and apply (commit).
// Preview writes an `upload` row with status='preview' plus `tender_match_review`
// rows. Apply reads the preview and commits NEW / UPDATE / missing flips plus
// `tender_field_change` log entries.

import { supabaseAdmin } from '@/lib/db';
import { parsePsipWorkbook } from './parser';
import { matchTenders, type ExistingTenderSnapshot, DIFFABLE_FIELDS } from './matcher';
import type { MatchResult, ParseResult, ParsedTender } from './types';

export interface PreviewOutcome {
  upload_id: string;
  parse_stats: ParseResult['stats'];
  match_stats: {
    new: number;
    updated: number;
    updated_field_changes: number;
    review_queue: number;
    high_confidence_matches: number;
    missing: number;
  };
  new_tenders: ParsedTender[];
  updated_tenders: Array<{ existing_tender_id: string; incoming: ParsedTender; field_diffs: MatchResult['field_diffs']; score: number }>;
  review_items: Array<{ id: string; incoming: ParsedTender; candidates: MatchResult['candidates'] }>;
  missing_tenders: ExistingTenderSnapshot[];
}

export interface IngestContext {
  uploadedBy: string;
  filename: string;
  storagePath: string;
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewPsipUpload(buffer: Buffer, ctx: IngestContext): Promise<PreviewOutcome> {
  const parse = parsePsipWorkbook(buffer);
  const existing = await fetchExistingSnapshots();
  const plan = matchTenders(parse.tenders, existing);

  // Persist an upload row in 'preview' state.
  const { data: uploadRow, error: uploadErr } = await supabaseAdmin
    .from('upload')
    .insert({
      filename: ctx.filename,
      storage_path: ctx.storagePath,
      uploaded_by: ctx.uploadedBy,
      status: 'preview',
      stats: {
        ...parse.stats,
        ...plan.stats,
      },
    })
    .select('id')
    .single();
  if (uploadErr || !uploadRow) throw uploadErr || new Error('Failed to insert upload row');

  // Persist review queue rows.
  const reviewInserts = plan.results
    .filter((r) => r.kind === 'review')
    .map((r) => ({
      upload_id: uploadRow.id,
      incoming_row: r.incoming as unknown as Record<string, unknown>,
      candidate_tender_ids: (r.candidates ?? []).map((c) => c.tender_id),
      scores: Object.fromEntries((r.candidates ?? []).map((c) => [c.tender_id, c.score])),
      status: 'pending' as const,
    }));

  let reviewItems: PreviewOutcome['review_items'] = [];
  if (reviewInserts.length > 0) {
    const { data: inserted, error: revErr } = await supabaseAdmin
      .from('tender_match_review')
      .insert(reviewInserts)
      .select('id, incoming_row, candidate_tender_ids, scores');
    if (revErr) throw revErr;
    const reviewResults = plan.results.filter((r) => r.kind === 'review');
    reviewItems = (inserted || []).map((row: Record<string, unknown>, i) => ({
      id: row.id as string,
      incoming: reviewResults[i].incoming,
      candidates: reviewResults[i].candidates,
    }));
  }

  const newTenders = plan.results.filter((r) => r.kind === 'new').map((r) => r.incoming);
  const updatedTenders = plan.results
    .filter((r) => r.kind === 'update')
    .map((r) => ({
      existing_tender_id: r.existing_tender_id!,
      incoming: r.incoming,
      field_diffs: r.field_diffs,
      score: r.score ?? 1,
    }));

  return {
    upload_id: uploadRow.id as string,
    parse_stats: parse.stats,
    match_stats: plan.stats,
    new_tenders: newTenders,
    updated_tenders: updatedTenders,
    review_items: reviewItems,
    missing_tenders: plan.missing,
  };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export async function applyPsipUpload(uploadId: string, buffer: Buffer, userId: string): Promise<{
  new: number;
  updated: number;
  updated_field_changes: number;
  review_queue: number;
  missing: number;
}> {
  // Re-parse + re-match to ensure the preview wasn't drifted. This also guards
  // against applying an upload whose preview-time state no longer matches.
  const parse = parsePsipWorkbook(buffer);
  const existing = await fetchExistingSnapshots();
  const plan = matchTenders(parse.tenders, existing);

  let newCount = 0;
  let updatedCount = 0;
  let fieldChangeCount = 0;

  for (const r of plan.results) {
    if (r.kind === 'new') {
      const inserted = await insertNewTender(r.incoming, uploadId);
      if (inserted) {
        await supabaseAdmin.from('tender_field_change').insert({
          tender_id: inserted,
          field_name: '__created',
          old_value: null,
          new_value: { source: 'psip', stage: r.incoming.stage, agency: r.incoming.agency },
          upload_id: uploadId,
          changed_by: userId,
        });
        newCount++;
      }
    } else if (r.kind === 'update' && r.existing_tender_id && r.field_diffs) {
      await applyUpdate(r.existing_tender_id, r.incoming, r.field_diffs, uploadId, userId);
      updatedCount++;
      fieldChangeCount += r.field_diffs.length;
    }
    // REVIEW rows are left as pending tender_match_review entries for human resolution.
  }

  // Flag missing.
  const missingIds = plan.missing.map((m) => m.id);
  if (missingIds.length > 0) {
    await supabaseAdmin
      .from('tender')
      .update({ missing_from_last_upload: true })
      .in('id', missingIds);
    await supabaseAdmin.from('tender_field_change').insert(
      missingIds.map((id) => ({
        tender_id: id,
        field_name: '__presence',
        old_value: 'present',
        new_value: 'missing',
        upload_id: uploadId,
        changed_by: userId,
      })),
    );
  }

  // Mark upload as applied.
  await supabaseAdmin
    .from('upload')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      stats: {
        ...parse.stats,
        ...plan.stats,
        new: newCount,
        updated: updatedCount,
        updated_field_changes: fieldChangeCount,
      },
    })
    .eq('id', uploadId);

  return {
    new: newCount,
    updated: updatedCount,
    updated_field_changes: fieldChangeCount,
    review_queue: plan.stats.review_queue,
    missing: plan.missing.length,
  };
}

// ── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelPsipUpload(uploadId: string): Promise<void> {
  await supabaseAdmin
    .from('upload')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', uploadId);
  // Orphan review rows get dropped with the upload via ON DELETE CASCADE if we
  // ever delete the upload; for cancellations we keep them for audit.
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchExistingSnapshots(): Promise<ExistingTenderSnapshot[]> {
  const { data, error } = await supabaseAdmin
    .from('tender')
    .select(`
      id, source, description, agency, programme_code, sub_programme_code,
      programme_activity, line_item_code, stage, stage_source, method,
      is_rollover, has_exception,
      date_advertised, date_closed, date_eval_sent_mtb_rtb,
      date_eval_sent_nptab, date_of_award,
      contractor, implementation_start_date, implementation_end_date,
      implementation_status_pct, remarks
    `);
  if (error) throw error;
  return ((data || []) as unknown) as ExistingTenderSnapshot[];
}

async function insertNewTender(inc: ParsedTender, uploadId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('tender')
    .insert({
      source: 'psip',
      description: inc.description,
      agency: inc.agency,
      programme_code: inc.programme_code,
      sub_programme_code: inc.sub_programme_code,
      programme_activity: inc.programme_activity,
      line_item_code: inc.line_item_code,
      stage: inc.stage,
      stage_source: inc.stage_source,
      method: inc.method,
      is_rollover: inc.is_rollover,
      has_exception: inc.has_exception,
      date_advertised: inc.date_advertised,
      date_closed: inc.date_closed,
      date_eval_sent_mtb_rtb: inc.date_eval_sent_mtb_rtb,
      date_eval_sent_nptab: inc.date_eval_sent_nptab,
      date_of_award: inc.date_of_award,
      contractor: inc.contractor,
      implementation_start_date: inc.implementation_start_date,
      implementation_end_date: inc.implementation_end_date,
      implementation_status_pct: inc.implementation_status_pct,
      remarks: inc.remarks,
      last_raw_row: inc.raw_row,
      first_seen_upload_id: uploadId,
      last_seen_upload_id: uploadId,
      missing_from_last_upload: false,
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id as string;
}

async function applyUpdate(
  tenderId: string,
  inc: ParsedTender,
  diffs: NonNullable<MatchResult['field_diffs']>,
  uploadId: string,
  userId: string,
): Promise<void> {
  // Build the update payload from the parsed tender (only diffed fields).
  const updatePayload: Record<string, unknown> = {
    last_seen_upload_id: uploadId,
    last_raw_row: inc.raw_row,
    missing_from_last_upload: false,
  };
  const diffFields = new Set(diffs.map((d) => d.field));
  for (const field of DIFFABLE_FIELDS) {
    if (diffFields.has(field)) {
      updatePayload[field] = (inc as unknown as Record<string, unknown>)[field];
    }
  }

  const { error: upErr } = await supabaseAdmin
    .from('tender')
    .update(updatePayload)
    .eq('id', tenderId);
  if (upErr) throw upErr;

  if (diffs.length > 0) {
    const changeRows = diffs.map((d) => ({
      tender_id: tenderId,
      field_name: d.field,
      old_value: d.old as unknown as object,
      new_value: d.new as unknown as object,
      upload_id: uploadId,
      changed_by: userId,
    }));
    const { error: chErr } = await supabaseAdmin.from('tender_field_change').insert(changeRows);
    if (chErr) throw chErr;
  }
}
