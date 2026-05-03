import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { archiveTender, listMissingTenders } from '@/lib/tender/queries';
import { supabaseAdmin } from '@/lib/db';
import { recordDecision } from '@/lib/procurement/decisions';
import { recordPresenceEvent } from '@/lib/procurement/presence';
import { recordStatusTransition } from '@/lib/procurement/status';
import { ARCHIVE_REASON_CODES, type ArchiveReasonCode } from '@/lib/tender/types';
import { logger } from '@/lib/logger';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const isMinistry = MINISTRY_ROLES.includes(session.user.role);
    const agency = isMinistry ? undefined : session.user.agency ?? undefined;
    const tenders = await listMissingTenders(agency);
    return NextResponse.json({ tenders });
  } catch (err) {
    logger.error({ err }, 'Error listing missing tenders');
    return NextResponse.json({ error: 'Failed to list missing tenders' }, { status: 500 });
  }
}

/**
 * POST /api/procurement/missing
 * body: { tender_id, action: 'resurrect' | 'archive', reason_code?, reason_text? }
 * - resurrect: flips missing_from_last_upload back to false. (Sticky semantics
 *   ship in R4; in R2 this is unchanged from the prior implementation.)
 * - archive: soft-archives the tender (DG only). Requires reason_code from
 *   ARCHIVE_REASON_CODES. Records a procurement_decision row.
 */
export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const tenderId = body?.tender_id as string | undefined;
    const action = body?.action as 'resurrect' | 'archive' | undefined;
    if (!tenderId || !action) return NextResponse.json({ error: 'tender_id and action are required' }, { status: 400 });

    if (action === 'resurrect') {
      const { data: tender, error: fetchErr } = await supabaseAdmin
        .from('tender')
        .select('agency, status, archived_at')
        .eq('id', tenderId)
        .single();
      if (fetchErr || !tender) {
        return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
      }
      if (tender.archived_at) {
        return NextResponse.json({ error: 'Cannot resurrect an archived tender — unarchive first' }, { status: 409 });
      }

      // Resurrect = sticky tracking. Setting keep_tracking_despite_missing
      // tells the matcher to suppress auto-flip-to-missing on subsequent
      // uploads where this tender remains absent. The user has explicitly
      // asserted the tender should keep being tracked.
      await supabaseAdmin
        .from('tender')
        .update({
          missing_from_last_upload: false,
          keep_tracking_despite_missing: true,
        })
        .eq('id', tenderId);

      await recordPresenceEvent({
        tender_id: tenderId,
        event_type: 'reappeared',
        agency: tender.agency as string,
        actor_id: session.user.id,
        actor_role: session.user.role,
      });

      const reasonText = (body?.reason_text as string | undefined) ?? null;
      const decisionId = await recordDecision({
        decision_type: 'resurrect',
        target_kind: 'tender',
        target_id: tenderId,
        agency: tender.agency as string,
        actor_id: session.user.id,
        actor_role: session.user.role,
        reason_code: null,
        reason_text: reasonText,
      });

      await recordStatusTransition({
        tender_id: tenderId,
        status_before: tender.status as 'active' | 'missing_pending_decision',
        status_after: 'active',
        decision_id: decisionId,
        decided_by: session.user.id,
        decided_role: session.user.role,
        reason_code: 'resurrect',
      });

      return NextResponse.json({ success: true, action: 'resurrect' });
    }

    if (action === 'archive') {
      if (session.user.role !== 'dg') {
        return NextResponse.json({ error: 'Only DG can archive tenders' }, { status: 403 });
      }

      const reasonCode = body?.reason_code as string | undefined;
      const reasonText = (body?.reason_text as string | undefined) ?? null;
      if (!reasonCode || !ARCHIVE_REASON_CODES.includes(reasonCode as ArchiveReasonCode)) {
        return NextResponse.json(
          { error: `reason_code is required and must be one of: ${ARCHIVE_REASON_CODES.join(', ')}` },
          { status: 400 },
        );
      }

      const { data: tender, error: fetchErr } = await supabaseAdmin
        .from('tender')
        .select('agency, status, archived_at')
        .eq('id', tenderId)
        .single();
      if (fetchErr || !tender) {
        return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
      }
      if (tender.archived_at) {
        return NextResponse.json({ error: 'Tender already archived' }, { status: 409 });
      }

      await archiveTender({
        tenderId,
        reasonCode: reasonCode as ArchiveReasonCode,
        reasonText,
        actorId: session.user.id,
        actorRole: session.user.role,
      });

      const decisionId = await recordDecision({
        decision_type: 'archive',
        target_kind: 'tender',
        target_id: tenderId,
        agency: tender.agency as string,
        actor_id: session.user.id,
        actor_role: session.user.role,
        reason_code: reasonCode,
        reason_text: reasonText,
      });

      await recordStatusTransition({
        tender_id: tenderId,
        status_before: tender.status as 'active' | 'missing_pending_decision',
        status_after: 'archived',
        decision_id: decisionId,
        decided_by: session.user.id,
        decided_role: session.user.role,
        reason_code: reasonCode,
      });

      return NextResponse.json({ success: true, action: 'archive' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    logger.error({ err }, 'Error resolving missing tender');
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
