// ── PSIP ingest orchestrator ──────────────────────────────────────────────────
//
// Two-phase: preview (no writes to `tender`) and apply (commit).
// Preview writes an `upload` row with status='preview' plus `tender_match_review`
// rows. Apply reads the preview and commits NEW / UPDATE / missing flips plus
// `tender_field_change` log entries.

import { supabaseAdmin } from '@/lib/db';
import { parsePsipWorkbook } from './parser';
import { matchTenders, type ExistingTenderSnapshot, DIFFABLE_FIELDS } from './matcher';
import type { MatchResult, ParseResult, ParsedTender, ReviewReason } from './types';
import {
  buildTenderSnapshot,
  diffTenderSnapshots,
  type TenderRowForSnapshot,
  type TenderSnapshot,
} from '@/lib/tender/freshness';
import { fetchMissingTenders, groupByAgency, type MissingTenderRow } from '@/lib/psip/nag/missing';
import { loadSettings, loadFocalPoints, runEventForAgency, markResolvedForAgency } from '@/lib/psip/nag/send';
import { TODAY_THRESHOLDS } from '@/lib/today/thresholds';
import { recordPresenceEventsBatch } from '@/lib/procurement/presence';
import { recordStatusTransitionsBatch } from '@/lib/procurement/status';
import {
  computeRowFingerprint,
  findExistingReviewByFingerprint,
  preprocessIncomingRows,
} from './fingerprint';
import { logger } from '@/lib/logger';

export interface PreviewOutcome {
  upload_id: string;
  uploaded_at: string;
  parse_stats: ParseResult['stats'];
  match_stats: {
    new: number;
    updated: number;
    updated_field_changes: number;
    review_queue: number;
    review_queue_ambiguous_match: number;
    review_queue_ambiguous_stage: number;
    high_confidence_matches: number;
    missing: number;
  };
  new_tenders: ParsedTender[];
  updated_tenders: Array<{ existing_tender_id: string; incoming: ParsedTender; field_diffs: MatchResult['field_diffs']; score: number }>;
  review_items: Array<{ id: string; incoming: ParsedTender; candidates: MatchResult['candidates']; review_reason: ReviewReason }>;
  missing_tenders: ExistingTenderSnapshot[];
}

export interface IngestContext {
  uploadedBy: string;
  filename: string;
  storagePath: string;
}

// ── In-batch dedup ───────────────────────────────────────────────────────────
//
// Drop rows whose fingerprint has already appeared in the same parse. The
// matcher then sees one row per fingerprint, so 'new' classifications never
// double-insert and 'update' classifications never double-write
// tender_field_change entries. Order of arrival is preserved; the FIRST row
// per fingerprint wins.
function dedupRowsByFingerprint(rows: ParsedTender[]): ParsedTender[] {
  const seen = new Map<string, ParsedTender>();
  for (const row of rows) {
    const fp = computeRowFingerprint(row);
    if (seen.has(fp)) continue;
    seen.set(fp, row);
  }
  return Array.from(seen.values());
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewPsipUpload(buffer: Buffer, ctx: IngestContext): Promise<PreviewOutcome> {
  const parse = parsePsipWorkbook(buffer);
  const existing = await fetchExistingSnapshots();

  // In-batch dedup by fingerprint: if the spreadsheet contains multiple rows
  // with the same (agency, programme, sub-programme, programme_activity,
  // description), keep the FIRST and drop the rest. Without this, rows that
  // would classify as 'new' produce duplicate active tenders, and rows that
  // classify as 'update' produce redundant tender_field_change entries. R5's
  // review-insert dedup catches the 'review' case via fingerprint already.
  const dedupedRows = dedupRowsByFingerprint(parse.tenders);
  const intra_batch_dups = parse.tenders.length - dedupedRows.length;

  // Route incoming rows through persisted Skip/Match decisions before matching.
  const preprocess = await preprocessIncomingRows(dedupedRows, existing);
  const plan = matchTenders(preprocess.remaining, existing);
  plan.results.push(...preprocess.injectedResults);
  plan.stats.updated += preprocess.prior_supersedes_count;
  if (preprocess.supersededTenderIds.size > 0) {
    plan.missing = plan.missing.filter((m) => !preprocess.supersededTenderIds.has(m.id));
  }

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
        excluded_via_skip: preprocess.excluded_count,
        prior_supersedes: preprocess.prior_supersedes_count,
        prior_duplicates: preprocess.prior_duplicates_count,
        intra_batch_dups,
      },
    })
    .select('id, uploaded_at')
    .single();
  if (uploadErr || !uploadRow) throw uploadErr || new Error('Failed to insert upload row');

  // Persist review queue rows with fingerprint-based dedup. If a pending or
  // skipped review row with the same fingerprint already exists, append this
  // upload's id to seen_in_uploads (and reset to 'pending' if it was a defer)
  // instead of inserting a duplicate.
  const reviewResults = plan.results.filter((r) => r.kind === 'review');
  const reviewItems: PreviewOutcome['review_items'] = [];
  for (const r of reviewResults) {
    const fingerprint = computeRowFingerprint(r.incoming);
    const existingReview = await findExistingReviewByFingerprint(fingerprint);

    if (existingReview) {
      const seen = Array.from(new Set([...(existingReview.seen_in_uploads ?? []), uploadRow.id as string]));
      const updatePayload: Record<string, unknown> = { seen_in_uploads: seen };
      if (existingReview.status === 'skipped') {
        // Defer-skipped rows resurface on next sighting (the only skip
        // reason that can reach here — permanent skips are filtered by
        // procurement_excluded_fingerprint upstream).
        updatePayload.status = 'pending';
        updatePayload.resolved_at = null;
        updatePayload.resolved_by = null;
      }
      const { error: upErr } = await supabaseAdmin
        .from('tender_match_review')
        .update(updatePayload)
        .eq('id', existingReview.id);
      if (upErr) throw upErr;
      reviewItems.push({
        id: existingReview.id,
        incoming: r.incoming,
        candidates: r.candidates,
        review_reason: (r.review_reason ?? 'ambiguous_match') as ReviewReason,
      });
      continue;
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('tender_match_review')
      .insert({
        upload_id: uploadRow.id,
        incoming_row: r.incoming as unknown as Record<string, unknown>,
        candidate_tender_ids: (r.candidates ?? []).map((c) => c.tender_id),
        scores: Object.fromEntries((r.candidates ?? []).map((c) => [c.tender_id, c.score])),
        status: 'pending' as const,
        review_reason: (r.review_reason ?? 'ambiguous_match') as ReviewReason,
        parsed_row_fingerprint: fingerprint,
        seen_in_uploads: [uploadRow.id],
      })
      .select('id')
      .single();
    if (insErr || !inserted) throw insErr || new Error('Failed to insert tender_match_review row');
    reviewItems.push({
      id: inserted.id as string,
      incoming: r.incoming,
      candidates: r.candidates,
      review_reason: (r.review_reason ?? 'ambiguous_match') as ReviewReason,
    });
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
    uploaded_at: uploadRow.uploaded_at as string,
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
  review_queue_ambiguous_match: number;
  review_queue_ambiguous_stage: number;
  missing: number;
}> {
  // Fetch upload.uploaded_at so awarded_at can be stamped with the upload
  // timestamp (not the apply-time now()). This matters when preview and
  // apply are separated by minutes/hours.
  const { data: uploadMeta, error: uploadMetaErr } = await supabaseAdmin
    .from('upload')
    .select('uploaded_at')
    .eq('id', uploadId)
    .single();
  if (uploadMetaErr || !uploadMeta) throw uploadMetaErr || new Error('Upload not found');
  const uploadedAt = uploadMeta.uploaded_at as string;

  // Re-parse + re-match to ensure the preview wasn't drifted. This also guards
  // against applying an upload whose preview-time state no longer matches.
  // The same preprocess (exclusions + prior match decisions) and in-batch
  // dedup run on apply so late-added Skip/Match decisions are honored and
  // duplicate-fingerprint rows do not cause double-writes.
  const parse = parsePsipWorkbook(buffer);
  const existing = await fetchExistingSnapshots();
  const dedupedRows = dedupRowsByFingerprint(parse.tenders);
  const preprocess = await preprocessIncomingRows(dedupedRows, existing);
  const plan = matchTenders(preprocess.remaining, existing);
  plan.results.push(...preprocess.injectedResults);
  plan.stats.updated += preprocess.prior_supersedes_count;
  if (preprocess.supersededTenderIds.size > 0) {
    plan.missing = plan.missing.filter((m) => !preprocess.supersededTenderIds.has(m.id));
  }
  const snapshotById = new Map(existing.map((e) => [e.id, e]));

  let newCount = 0;
  let updatedCount = 0;
  let fieldChangeCount = 0;
  // Tenders that re-appeared in this upload after being in
  // missing_pending_decision — transition them back to active.
  const reappearedTenders: Array<{ id: string; agency: string }> = [];

  for (const r of plan.results) {
    if (r.kind === 'new') {
      const inserted = await insertNewTender(r.incoming, uploadId, uploadedAt);
      if (inserted) {
        // Provenance for NEW tenders lives on tender.first_seen_upload_id +
        // upload.stats.new — no '__created' sentinel is written into the
        // field-change log (which is reserved for real field diffs).
        // Stamp first-Award field_change when incoming is already at award.
        if (r.incoming.stage === 'award') {
          await supabaseAdmin.from('tender_field_change').insert({
            tender_id: inserted,
            field_name: 'awarded_at',
            old_value: null,
            new_value: uploadedAt,
            upload_id: uploadId,
            changed_by: userId,
          });
        }
        newCount++;
      }
    } else if (r.kind === 'update' && r.existing_tender_id && r.field_diffs) {
      const previous = snapshotById.get(r.existing_tender_id) || null;
      const extraChanges = await applyUpdate(
        r.existing_tender_id,
        r.incoming,
        r.field_diffs,
        uploadId,
        userId,
        uploadedAt,
        previous,
      );
      updatedCount++;
      fieldChangeCount += r.field_diffs.length + extraChanges;
      if (previous?.status === 'missing_pending_decision') {
        reappearedTenders.push({ id: r.existing_tender_id, agency: previous.agency });
      }
    }
    // REVIEW rows are left as pending tender_match_review entries for human resolution.
  }

  // Phase 2: reappearance closes a missing_pending_decision automatically.
  // The tender is back in PSIP; the system was waiting for either human
  // judgment or this re-emergence. Transition status='active', emit a
  // 'reappeared' presence event, and clear the legacy missing flag (which
  // applyUpdate already did inline; recorded here for completeness).
  if (reappearedTenders.length > 0) {
    const { data: sysUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', 'system@mpua.gov.gy')
      .single();
    if (sysUser) {
      await recordStatusTransitionsBatch(
        reappearedTenders.map((t) => ({
          tender_id: t.id,
          status_before: 'missing_pending_decision',
          status_after: 'active',
          decided_by: sysUser.id as string,
          decided_role: 'system',
          reason_code: 'reappeared_in_upload',
        })),
      );
    }
    await recordPresenceEventsBatch(
      reappearedTenders.map((t) => ({
        tender_id: t.id,
        event_type: 'reappeared' as const,
        agency: t.agency,
        upload_id: uploadId,
      })),
    );
  }

  // Flag missing. Phase 2: also write a tender_status_decision so
  // tender.status transitions to 'missing_pending_decision' via trigger.
  // Disappearance events go to tender_presence_event. The legacy
  // missing_from_last_upload flag is kept in sync for backward compat
  // with surfaces that haven't migrated to status yet.
  // Sticky-tracked tenders (keep_tracking_despite_missing=true, set via
  // Resurrect) are excluded from all three writes — the user has already
  // asserted the tender should keep being tracked through absences.
  const missingIds = plan.missing.map((m) => m.id);
  if (missingIds.length > 0) {
    const { data: tenderRows } = await supabaseAdmin
      .from('tender')
      .select('id, status, keep_tracking_despite_missing')
      .in('id', missingIds);
    const stickyIds = new Set(
      (tenderRows || [])
        .filter((r) => r.keep_tracking_despite_missing as boolean)
        .map((r) => r.id as string),
    );
    const statusById = new Map(
      (tenderRows || []).map((r) => [r.id as string, r.status as string]),
    );
    const flippable = plan.missing.filter((m) => !stickyIds.has(m.id));

    if (flippable.length > 0) {
      await supabaseAdmin
        .from('tender')
        .update({ missing_from_last_upload: true })
        .in('id', flippable.map((m) => m.id));

      await recordPresenceEventsBatch(
        flippable.map((m) => ({
          tender_id: m.id,
          event_type: 'disappeared' as const,
          agency: m.agency as string,
          upload_id: uploadId,
        })),
      );

      // Only write a status transition if the tender wasn't already in
      // missing_pending_decision (idempotent across repeat absences).
      const transitioning = flippable.filter(
        (m) => statusById.get(m.id) !== 'missing_pending_decision',
      );
      if (transitioning.length > 0) {
        const { data: sysUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', 'system@mpua.gov.gy')
          .single();
        if (sysUser) {
          await recordStatusTransitionsBatch(
            transitioning.map((m) => ({
              tender_id: m.id,
              status_before: (statusById.get(m.id) as 'active' | undefined) ?? 'active',
              status_after: 'missing_pending_decision',
              decided_by: sysUser.id as string,
              decided_role: 'system',
              reason_code: 'absent_from_upload',
            })),
          );
        }
      }
    }
  }

  // Freshness snapshot + stagnant_weeks bookkeeping.
  const freshness = await recordFreshnessSnapshots(uploadId, missingIds);

  // Event-trigger nag emails for agencies that crossed the critical threshold
  // AND have at least one tender that newly entered the missing-dates state.
  // Failures here are logged but do not fail the upload.
  let eventNagResult: { considered: number; sent: number; preview_ids: string[] } = { considered: 0, sent: 0, preview_ids: [] };
  try {
    eventNagResult = await runEventNags(existing);
  } catch (err) {
    logger.error({ err }, 'applyPsipUpload: event nag pass failed');
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
        freshness_snapshots_written: freshness.snapshotsWritten,
        freshness_stagnant_bumped: freshness.stagnantBumped,
        event_nags_considered: eventNagResult.considered,
        event_nags_sent: eventNagResult.sent,
      },
    })
    .eq('id', uploadId);

  return {
    new: newCount,
    updated: updatedCount,
    updated_field_changes: fieldChangeCount,
    review_queue: plan.stats.review_queue,
    review_queue_ambiguous_match: plan.stats.review_queue_ambiguous_match,
    review_queue_ambiguous_stage: plan.stats.review_queue_ambiguous_stage,
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
  // Phase 2: only active and missing_pending_decision tenders participate
  // in matching. Archived/withdrawn/completed_outside_psip/agency_error
  // tenders represent deliberate human decisions about identity; rows
  // that look like them in a future upload become NEW tenders rather
  // than silently overriding the prior decision.
  const { data, error } = await supabaseAdmin
    .from('tender')
    .select(`
      id, source, description, agency, programme_code, sub_programme_code,
      programme_activity, line_item_code, stage, stage_source, method,
      is_rollover, has_exception,
      date_advertised, date_closed, date_eval_sent_mtb_rtb,
      date_eval_sent_nptab, date_of_award,
      contractor, implementation_start_date, implementation_end_date,
      implementation_status_pct, remarks,
      awarded_at, first_appearance_already_awarded,
      status
    `)
    .in('status', ['active', 'missing_pending_decision']);
  if (error) throw error;
  return ((data || []) as unknown) as ExistingTenderSnapshot[];
}

async function insertNewTender(
  inc: ParsedTender,
  uploadId: string,
  uploadedAt: string,
): Promise<string | null> {
  // Award-tracking: stamp awarded_at with the upload timestamp whenever a
  // tender is first ingested at stage='award'. Flag first_appearance_already_awarded
  // so the UI can honestly render "we don't know the true transition date".
  const alreadyAwarded = inc.stage === 'award';
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
      awarded_at: alreadyAwarded ? uploadedAt : null,
      first_appearance_already_awarded: alreadyAwarded,
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
  uploadedAt: string,
  existing: ExistingTenderSnapshot | null,
): Promise<number> {
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

  // Award-tracking: stamp awarded_at on first observation of stage='award'
  // and NEVER overwrite it afterwards. The stage diff (if present) already
  // takes care of the stage transition; we just need to stamp the timestamp.
  let extraChangeCount = 0;
  const stageDiff = diffs.find((d) => d.field === 'stage');
  const transitioningToAward = stageDiff && stageDiff.new === 'award' && stageDiff.old !== 'award';
  const existingAwardedAt = existing?.awarded_at ?? null;
  if (transitioningToAward && !existingAwardedAt) {
    updatePayload.awarded_at = uploadedAt;
    // Don't flip first_appearance_already_awarded here — it's only true when
    // the tender's first-ever row was already Award.
    await supabaseAdmin.from('tender_field_change').insert({
      tender_id: tenderId,
      field_name: 'awarded_at',
      old_value: null,
      new_value: uploadedAt,
      upload_id: uploadId,
      changed_by: userId,
    });
    extraChangeCount++;
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

  return extraChangeCount;
}

// ── Freshness bookkeeping ────────────────────────────────────────────────────
//
// For every tender present in this upload (last_seen_upload_id = uploadId),
// write a snapshot of diffable fields and update stagnant_weeks:
//   - No prior snapshot (first-ever upload for this tender): stagnant_weeks = 0
//   - Prior snapshot exists and differs: stagnant_weeks = 0 (reset)
//   - Prior snapshot exists and matches: stagnant_weeks += 1
//
// Missing tenders (in DB but not in this upload) get stagnant_weeks reset to 0
// — they've either been removed or renamed, neither of which is "stagnation".

const FRESHNESS_SNAPSHOT_COLUMNS = `
  id, stage, date_advertised, date_closed, date_eval_sent_mtb_rtb,
  date_eval_sent_nptab, date_of_award, contractor,
  implementation_status_pct, implementation_start_date,
  implementation_end_date, remarks, stagnant_weeks
`.replace(/\s+/g, ' ').trim();

async function recordFreshnessSnapshots(
  uploadId: string,
  missingIds: string[],
): Promise<{ snapshotsWritten: number; stagnantBumped: number }> {
  // Tenders present in this upload.
  const { data: presentRows, error: presentErr } = await supabaseAdmin
    .from('tender')
    .select(FRESHNESS_SNAPSHOT_COLUMNS)
    .eq('last_seen_upload_id', uploadId);
  if (presentErr) throw presentErr;

  const present = (presentRows || []) as unknown as Array<TenderRowForSnapshot & { id: string; stagnant_weeks: number }>;
  if (present.length === 0) {
    if (missingIds.length > 0) {
      await supabaseAdmin.from('tender').update({ stagnant_weeks: 0 }).in('id', missingIds);
    }
    return { snapshotsWritten: 0, stagnantBumped: 0 };
  }

  const presentIds = present.map((r) => r.id);

  // Load the most recent prior snapshot per tender (from any earlier upload).
  const { data: priorRows, error: priorErr } = await supabaseAdmin
    .from('tender_upload_snapshot')
    .select('tender_id, snapshot_fields, created_at')
    .in('tender_id', presentIds)
    .neq('upload_id', uploadId)
    .order('created_at', { ascending: false });
  if (priorErr) throw priorErr;

  const priorByTender = new Map<string, TenderSnapshot>();
  for (const r of priorRows || []) {
    const tid = r.tender_id as string;
    if (!priorByTender.has(tid)) priorByTender.set(tid, r.snapshot_fields as TenderSnapshot);
  }

  // Write this upload's snapshots.
  const snapshotInserts = present.map((row) => ({
    upload_id: uploadId,
    tender_id: row.id,
    snapshot_fields: buildTenderSnapshot(row),
  }));
  const { error: snapErr } = await supabaseAdmin
    .from('tender_upload_snapshot')
    .upsert(snapshotInserts, { onConflict: 'upload_id,tender_id' });
  if (snapErr) throw snapErr;

  // Recompute stagnant_weeks per tender.
  let stagnantBumped = 0;
  const perValueUpdates = new Map<number, string[]>();
  for (const row of present) {
    const curr = buildTenderSnapshot(row);
    const prev = priorByTender.get(row.id);
    let next: number;
    if (!prev) {
      next = 0; // first observation — no basis for stagnation yet
    } else if (diffTenderSnapshots(curr, prev).changed) {
      next = 0;
    } else {
      next = (row.stagnant_weeks ?? 0) + 1;
      stagnantBumped++;
    }
    if (next !== row.stagnant_weeks) {
      const bucket = perValueUpdates.get(next) ?? [];
      bucket.push(row.id);
      perValueUpdates.set(next, bucket);
    }
  }

  // Batch updates by target value to minimize round trips.
  for (const [value, ids] of perValueUpdates) {
    const { error: uErr } = await supabaseAdmin
      .from('tender')
      .update({ stagnant_weeks: value })
      .in('id', ids);
    if (uErr) throw uErr;
  }

  if (missingIds.length > 0) {
    await supabaseAdmin.from('tender').update({ stagnant_weeks: 0 }).in('id', missingIds);
  }

  return { snapshotsWritten: snapshotInserts.length, stagnantBumped };
}

// ── Event-trigger nag orchestration ──────────────────────────────────────────
// Called once after applyPsipUpload commits. For every agency whose post-
// upload missing-date tender count crosses the critical threshold AND whose
// newly-missing tenders set is non-empty, compose an "NEW critical missing-
// date gap" email via runEventForAgency. consecutive_weekly_count is NOT
// bumped here — event triggers are orthogonal to the weekly cadence.

// Pre-upload missing detection mirrors missingFieldFor in lib/psip/nag/missing
// but runs against the ExistingTenderSnapshot shape available in-memory.
function preUploadMissingFor(row: ExistingTenderSnapshot): boolean {
  if (row.is_rollover || row.has_exception) return false;
  switch (row.stage) {
    case 'advertised':
      return row.date_advertised === null;
    case 'evaluation':
      return row.date_closed === null;
    case 'awaiting_award':
      return row.date_eval_sent_nptab === null
        && row.date_eval_sent_mtb_rtb === null
        && row.date_closed === null;
    default:
      return false;
  }
}

async function runEventNags(preUploadExisting: ExistingTenderSnapshot[]): Promise<{
  considered: number;
  sent: number;
  preview_ids: string[];
}> {
  const preMissingIds = new Set(
    preUploadExisting.filter(preUploadMissingFor).map((t) => t.id),
  );

  const [settings, focals, postMissing] = await Promise.all([
    loadSettings(),
    loadFocalPoints(),
    fetchMissingTenders(),
  ]);
  const postByAgency = groupByAgency(postMissing);

  // Resolution pass: tenders previously nagged that are no longer missing.
  const stillMissingByAgency = new Map<string, Set<string>>();
  for (const [a, list] of postByAgency) stillMissingByAgency.set(a, new Set(list.map((t) => t.id)));
  for (const agency of focals.keys()) {
    await markResolvedForAgency(agency, stillMissingByAgency.get(agency) ?? new Set<string>());
  }

  const criticalThreshold = TODAY_THRESHOLDS.incomplete_psip.critical_count;
  let considered = 0;
  let sent = 0;
  const previewIds: string[] = [];
  const now = new Date();

  for (const [agency, tenders] of postByAgency) {
    const newGaps: MissingTenderRow[] = tenders.filter((t) => !preMissingIds.has(t.id));
    if (tenders.length < criticalThreshold || newGaps.length === 0) continue;
    considered++;
    const outcome = await runEventForAgency({
      agency,
      newGaps,
      totalMissingAfterUpload: tenders.length,
      criticalThreshold,
      focal: focals.get(agency),
      settings,
      now,
    });
    if (outcome.preview_id) previewIds.push(outcome.preview_id);
    if (outcome.attempted_send && outcome.sent_success) sent++;
  }

  return { considered, sent, preview_ids: previewIds };
}
