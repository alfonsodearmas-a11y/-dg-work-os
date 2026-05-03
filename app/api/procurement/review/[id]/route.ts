import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { DIFFABLE_FIELDS } from '@/lib/psip/matcher';
import { logger } from '@/lib/logger';
import type { ParsedTender, TenderStage } from '@/lib/psip/types';

const VALID_STAGES: TenderStage[] = ['design', 'advertised', 'evaluation', 'awaiting_award', 'award'];

/** POST /api/procurement/review/[id] — resolve a review-queue row */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const action = body?.action as 'match' | 'create' | 'skip';
    const targetTenderId = body?.tender_id as string | undefined;
    // For ambiguous_stage reviews, the human assigns a stage.
    const assignedStage = body?.stage as TenderStage | undefined;

    if (!['match', 'create', 'skip'].includes(action)) {
      return NextResponse.json({ error: 'action must be match | create | skip' }, { status: 400 });
    }

    const { data: review, error: revErr } = await supabaseAdmin
      .from('tender_match_review')
      .select('id, upload_id, incoming_row, status, review_reason')
      .eq('id', id)
      .single();
    if (revErr || !review) return NextResponse.json({ error: 'Review row not found' }, { status: 404 });
    if (review.status !== 'pending') {
      return NextResponse.json({ error: `Already resolved (${review.status})` }, { status: 409 });
    }

    const incoming = review.incoming_row as unknown as ParsedTender;
    const uploadId = review.upload_id as string;
    const reviewReason = (review.review_reason as string) || 'ambiguous_match';

    // Fetch the upload's uploaded_at so we can honestly stamp awarded_at
    // if the resolution creates/moves a tender into the 'award' stage.
    const { data: uploadMeta } = await supabaseAdmin
      .from('upload')
      .select('uploaded_at')
      .eq('id', uploadId)
      .single();
    const uploadedAt = (uploadMeta?.uploaded_at as string) || new Date().toISOString();

    // Validate stage assignment for ambiguous_stage reviews.
    if (reviewReason === 'ambiguous_stage' && action === 'create') {
      if (!assignedStage || !VALID_STAGES.includes(assignedStage)) {
        return NextResponse.json({ error: 'stage is required for ambiguous_stage reviews' }, { status: 400 });
      }
    }

    if (action === 'match') {
      if (!targetTenderId) return NextResponse.json({ error: 'tender_id is required for action=match' }, { status: 400 });
      // Apply diffs to the chosen tender.
      const { data: existing, error: getErr } = await supabaseAdmin
        .from('tender')
        .select('*')
        .eq('id', targetTenderId)
        .single();
      if (getErr || !existing) return NextResponse.json({ error: 'Candidate tender not found' }, { status: 404 });

      const existingRow = existing as Record<string, unknown>;
      const updatePayload: Record<string, unknown> = {
        last_seen_upload_id: uploadId,
        last_raw_row: incoming.raw_row,
        missing_from_last_upload: false,
      };
      const diffs: Array<{ field: string; old: unknown; new: unknown }> = [];
      for (const f of DIFFABLE_FIELDS) {
        const oVal = existingRow[f];
        const nVal = (incoming as unknown as Record<string, unknown>)[f];
        if (String(oVal ?? '') !== String(nVal ?? '')) {
          updatePayload[f] = nVal;
          diffs.push({ field: f, old: oVal, new: nVal });
        }
      }
      // Award-tracking: first transition to award stamps awarded_at, never overwrites.
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
      await supabaseAdmin
        .from('tender_match_review')
        .update({ status: 'matched', resolution_tender_id: targetTenderId, resolved_at: new Date().toISOString(), resolved_by: session.user.id })
        .eq('id', id);
      return NextResponse.json({ success: true, action: 'match', tender_id: targetTenderId });
    }

    if (action === 'create') {
      // For ambiguous_stage reviews, the human-assigned stage overrides the
      // incoming row's provisional 'design'. stage_source flips to manual_override
      // since this is a human call, not a parser inference.
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

      // No '__created' sentinel: provenance for review-resolved NEW tenders
      // lives on tender.first_seen_upload_id and will be carried by the
      // procurement_decision row written by R5 (decision_type='create_from_review').
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
        .update({ status: 'created', resolution_tender_id: inserted.id, resolved_at: new Date().toISOString(), resolved_by: session.user.id })
        .eq('id', id);
      return NextResponse.json({ success: true, action: 'create', tender_id: inserted.id });
    }

    // skip
    await supabaseAdmin
      .from('tender_match_review')
      .update({ status: 'skipped', resolved_at: new Date().toISOString(), resolved_by: session.user.id })
      .eq('id', id);
    return NextResponse.json({ success: true, action: 'skip' });
  } catch (err) {
    logger.error({ err, id }, 'Error resolving review row');
    return NextResponse.json({ error: 'Failed to resolve' }, { status: 500 });
  }
}
