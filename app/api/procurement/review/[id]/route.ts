import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { DIFFABLE_FIELDS } from '@/lib/psip/matcher';
import { computeRowFingerprint } from '@/lib/psip/fingerprint';
import { recordDecision } from '@/lib/procurement/decisions';
import { logger } from '@/lib/logger';
import type { ParsedTender, TenderStage } from '@/lib/psip/types';

const VALID_STAGES: TenderStage[] = ['design', 'advertised', 'evaluation', 'awaiting_award', 'award'];

const SKIP_REASON_CODES = ['defer', 'header_or_subtotal', 'not_a_tender', 'agency_error'] as const;
type SkipReasonCode = typeof SKIP_REASON_CODES[number];
const PERMANENT_SKIP_REASONS: SkipReasonCode[] = ['header_or_subtotal', 'not_a_tender', 'agency_error'];

const MATCH_REASON_CODES = ['supersedes', 'duplicates'] as const;
type MatchReasonCode = typeof MATCH_REASON_CODES[number];

/**
 * POST /api/procurement/review/[id] — resolve a review-queue row.
 *
 * action='match'  body: { tender_id, reason_code: 'supersedes' | 'duplicates', reason_text? }
 *   - 'supersedes': fold the parsed row's diffs into the chosen tender (the
 *     pre-R5 'match' behavior). Writes a procurement_match_decision so future
 *     uploads of the same fingerprint auto-route here.
 *   - 'duplicates': bind the row to the chosen tender WITHOUT applying diffs.
 *     The chosen tender is canonical; this row is a redundant copy. Future
 *     uploads of the same fingerprint silently drop.
 *
 * action='create' body: { stage? (required for ambiguous_stage), reason_text? }
 *   Creates a new tender from the parsed row. Writes a procurement_decision
 *   (decision_type='create_from_review').
 *
 * action='skip' body: { reason_code: 'defer'|'header_or_subtotal'|'not_a_tender'|'agency_error', reason_text? }
 *   - 'defer': mark resolved=skipped; the next upload's preprocess will resurface
 *     this row by appending its upload_id and flipping status back to 'pending'.
 *   - permanent reasons: write a procurement_excluded_fingerprint row so future
 *     uploads silently drop matching parsed rows at the parse/match boundary.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const action = body?.action as 'match' | 'create' | 'skip';
    const targetTenderId = body?.tender_id as string | undefined;
    const assignedStage = body?.stage as TenderStage | undefined;
    const rawReasonCode = body?.reason_code as string | undefined;
    const reasonText = (body?.reason_text as string | undefined) ?? null;

    if (!['match', 'create', 'skip'].includes(action)) {
      return NextResponse.json({ error: 'action must be match | create | skip' }, { status: 400 });
    }

    const { data: review, error: revErr } = await supabaseAdmin
      .from('tender_match_review')
      .select('id, upload_id, incoming_row, status, review_reason, parsed_row_fingerprint')
      .eq('id', id)
      .single();
    if (revErr || !review) return NextResponse.json({ error: 'Review row not found' }, { status: 404 });
    if (review.status !== 'pending') {
      return NextResponse.json({ error: `Already resolved (${review.status})` }, { status: 409 });
    }

    const incoming = review.incoming_row as unknown as ParsedTender;
    const uploadId = review.upload_id as string;
    const reviewReason = (review.review_reason as string) || 'ambiguous_match';
    const fingerprint = (review.parsed_row_fingerprint as string | null) || computeRowFingerprint(incoming);
    const agency = (incoming.agency as string) || '';

    // Fetch the upload's uploaded_at so we can honestly stamp awarded_at
    // if the resolution creates/moves a tender into the 'award' stage.
    const { data: uploadMeta } = await supabaseAdmin
      .from('upload')
      .select('uploaded_at')
      .eq('id', uploadId)
      .single();
    const uploadedAt = (uploadMeta?.uploaded_at as string) || new Date().toISOString();

    if (reviewReason === 'ambiguous_stage' && action === 'create') {
      if (!assignedStage || !VALID_STAGES.includes(assignedStage)) {
        return NextResponse.json({ error: 'stage is required for ambiguous_stage reviews' }, { status: 400 });
      }
    }

    if (action === 'match') {
      if (!targetTenderId) return NextResponse.json({ error: 'tender_id is required for action=match' }, { status: 400 });
      if (!rawReasonCode || !MATCH_REASON_CODES.includes(rawReasonCode as MatchReasonCode)) {
        return NextResponse.json(
          { error: `reason_code is required and must be one of: ${MATCH_REASON_CODES.join(', ')}` },
          { status: 400 },
        );
      }
      const matchReason = rawReasonCode as MatchReasonCode;

      const { data: existing, error: getErr } = await supabaseAdmin
        .from('tender')
        .select('*')
        .eq('id', targetTenderId)
        .single();
      if (getErr || !existing) return NextResponse.json({ error: 'Candidate tender not found' }, { status: 404 });

      // 'duplicates' binds without applying diffs; 'supersedes' folds diffs in.
      const existingRow = existing as Record<string, unknown>;
      const updatePayload: Record<string, unknown> = {
        last_seen_upload_id: uploadId,
        last_raw_row: incoming.raw_row,
        missing_from_last_upload: false,
      };
      const diffs: Array<{ field: string; old: unknown; new: unknown }> = [];

      if (matchReason === 'supersedes') {
        for (const f of DIFFABLE_FIELDS) {
          const oVal = existingRow[f];
          const nVal = (incoming as unknown as Record<string, unknown>)[f];
          if (String(oVal ?? '') !== String(nVal ?? '')) {
            updatePayload[f] = nVal;
            diffs.push({ field: f, old: oVal, new: nVal });
          }
        }
        const stageDiff = diffs.find((d) => d.field === 'stage');
        const transitioningToAward = stageDiff && stageDiff.new === 'award' && stageDiff.old !== 'award';
        const existingAwardedAt = (existingRow.awarded_at as string | null) ?? null;
        if (transitioningToAward && !existingAwardedAt) {
          updatePayload.awarded_at = uploadedAt;
        }

        await supabaseAdmin.from('tender').update(updatePayload).eq('id', targetTenderId);
        if (diffs.length > 0) {
          await supabaseAdmin.from('tender_field_change').insert(
            diffs.map((d) => ({
              tender_id: targetTenderId,
              field_name: d.field,
              old_value: d.old as unknown as object,
              new_value: d.new as unknown as object,
              upload_id: uploadId,
              changed_by: session.user.id,
            })),
          );
        }
        if (transitioningToAward && !existingAwardedAt) {
          await supabaseAdmin.from('tender_field_change').insert({
            tender_id: targetTenderId,
            field_name: 'awarded_at',
            old_value: null,
            new_value: uploadedAt,
            upload_id: uploadId,
            changed_by: session.user.id,
          });
        }
      } else {
        // 'duplicates' — touch only last_seen / missing flags so the canonical
        // tender's freshness is correctly observed; do not overwrite its fields.
        await supabaseAdmin.from('tender').update(updatePayload).eq('id', targetTenderId);
      }

      // Persist the match decision so future uploads with the same fingerprint
      // auto-route to this tender without surfacing the row again.
      await supabaseAdmin.from('procurement_match_decision').insert({
        fingerprint,
        resolution_tender_id: targetTenderId,
        reason_code: matchReason,
        agency,
        decided_by: session.user.id,
        decided_role: session.user.role,
      });

      await supabaseAdmin
        .from('tender_match_review')
        .update({
          status: 'matched',
          resolution_tender_id: targetTenderId,
          resolved_at: new Date().toISOString(),
          resolved_by: session.user.id,
        })
        .eq('id', id);

      await recordDecision({
        decision_type: 'match',
        target_kind: 'review_row',
        target_id: id,
        agency,
        actor_id: session.user.id,
        actor_role: session.user.role,
        reason_code: matchReason,
        reason_text: reasonText,
      });

      return NextResponse.json({ success: true, action: 'match', tender_id: targetTenderId, reason_code: matchReason });
    }

    if (action === 'create') {
      const finalStage: TenderStage = reviewReason === 'ambiguous_stage' ? (assignedStage as TenderStage) : incoming.stage;
      const finalStageSource = reviewReason === 'ambiguous_stage' ? 'manual_override' : incoming.stage_source;
      const alreadyAwarded = finalStage === 'award';

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('tender')
        .insert({
          source: 'psip',
          description: incoming.description,
          agency: incoming.agency,
          programme_code: incoming.programme_code,
          sub_programme_code: incoming.sub_programme_code,
          programme_activity: incoming.programme_activity,
          line_item_code: incoming.line_item_code,
          stage: finalStage,
          stage_source: finalStageSource,
          method: incoming.method,
          is_rollover: incoming.is_rollover,
          has_exception: incoming.has_exception,
          date_advertised: incoming.date_advertised,
          date_closed: incoming.date_closed,
          date_eval_sent_mtb_rtb: incoming.date_eval_sent_mtb_rtb,
          date_eval_sent_nptab: incoming.date_eval_sent_nptab,
          date_of_award: incoming.date_of_award,
          contractor: incoming.contractor,
          implementation_start_date: incoming.implementation_start_date,
          implementation_end_date: incoming.implementation_end_date,
          implementation_status_pct: incoming.implementation_status_pct,
          remarks: incoming.remarks,
          last_raw_row: incoming.raw_row,
          first_seen_upload_id: uploadId,
          last_seen_upload_id: uploadId,
          awarded_at: alreadyAwarded ? uploadedAt : null,
          first_appearance_already_awarded: alreadyAwarded,
        })
        .select('id')
        .single();
      if (insErr || !inserted) return NextResponse.json({ error: 'Failed to create tender' }, { status: 500 });

      if (alreadyAwarded) {
        await supabaseAdmin.from('tender_field_change').insert({
          tender_id: inserted.id,
          field_name: 'awarded_at',
          old_value: null,
          new_value: uploadedAt,
          upload_id: uploadId,
          changed_by: session.user.id,
        });
      }

      await supabaseAdmin
        .from('tender_match_review')
        .update({
          status: 'created',
          resolution_tender_id: inserted.id,
          resolved_at: new Date().toISOString(),
          resolved_by: session.user.id,
        })
        .eq('id', id);

      await recordDecision({
        decision_type: 'create_from_review',
        target_kind: 'review_row',
        target_id: id,
        agency,
        actor_id: session.user.id,
        actor_role: session.user.role,
        reason_code: reviewReason === 'ambiguous_stage' ? `assigned_stage:${finalStage}` : null,
        reason_text: reasonText,
      });

      return NextResponse.json({ success: true, action: 'create', tender_id: inserted.id });
    }

    // skip
    if (!rawReasonCode || !SKIP_REASON_CODES.includes(rawReasonCode as SkipReasonCode)) {
      return NextResponse.json(
        { error: `reason_code is required and must be one of: ${SKIP_REASON_CODES.join(', ')}` },
        { status: 400 },
      );
    }
    const skipReason = rawReasonCode as SkipReasonCode;

    if (PERMANENT_SKIP_REASONS.includes(skipReason)) {
      // Persist the exclusion so future uploads silently drop this fingerprint.
      await supabaseAdmin
        .from('procurement_excluded_fingerprint')
        .upsert(
          {
            fingerprint,
            reason_code: skipReason,
            agency,
            example_incoming: incoming as unknown as Record<string, unknown>,
            decided_by: session.user.id,
            decided_role: session.user.role,
          },
          { onConflict: 'fingerprint' },
        );
    }

    await supabaseAdmin
      .from('tender_match_review')
      .update({
        status: 'skipped',
        resolved_at: new Date().toISOString(),
        resolved_by: session.user.id,
      })
      .eq('id', id);

    await recordDecision({
      decision_type: PERMANENT_SKIP_REASONS.includes(skipReason) ? 'permanent_ignore' : 'skip',
      target_kind: 'review_row',
      target_id: id,
      agency,
      actor_id: session.user.id,
      actor_role: session.user.role,
      reason_code: skipReason,
      reason_text: reasonText,
    });

    return NextResponse.json({ success: true, action: 'skip', reason_code: skipReason });
  } catch (err) {
    logger.error({ err, id }, 'Error resolving review row');
    return NextResponse.json({ error: 'Failed to resolve' }, { status: 500 });
  }
}
