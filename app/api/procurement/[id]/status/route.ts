import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { recordDecision } from '@/lib/procurement/decisions';
import { recordStatusTransition, type TenderStatus } from '@/lib/procurement/status';
import { logger } from '@/lib/logger';

// Transitions allowed via this endpoint. 'archived' goes through the dedicated
// archive flow (which carries archive_reason_code semantics) and 'active' goes
// through Resurrect. This endpoint is the inbox's terminal-state setter for
// missing_pending_decision tenders.
const ALLOWED_TRANSITIONS = ['withdrawn', 'completed_outside_psip', 'agency_error'] as const;
type AllowedTransition = typeof ALLOWED_TRANSITIONS[number];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const target = body?.target_status as string | undefined;
    const reasonText = (body?.reason_text as string | undefined) ?? null;

    if (!target || !ALLOWED_TRANSITIONS.includes(target as AllowedTransition)) {
      return NextResponse.json(
        { error: `target_status is required and must be one of: ${ALLOWED_TRANSITIONS.join(', ')}` },
        { status: 400 },
      );
    }
    const targetStatus = target as AllowedTransition;

    const { data: tender, error: fetchErr } = await supabaseAdmin
      .from('tender')
      .select('agency, status')
      .eq('id', id)
      .single();
    if (fetchErr || !tender) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }
    if (tender.status !== 'missing_pending_decision') {
      return NextResponse.json(
        { error: `Tender is not in missing_pending_decision (current: ${tender.status})` },
        { status: 409 },
      );
    }

    const decisionId = await recordDecision({
      decision_type: 'status_change',
      target_kind: 'tender',
      target_id: id,
      agency: tender.agency as string,
      actor_id: session.user.id,
      actor_role: session.user.role,
      reason_code: targetStatus,
      reason_text: reasonText,
    });

    await recordStatusTransition({
      tender_id: id,
      status_before: tender.status as TenderStatus,
      status_after: targetStatus,
      decision_id: decisionId,
      decided_by: session.user.id,
      decided_role: session.user.role,
      reason_code: targetStatus,
    });

    return NextResponse.json({ success: true, status: targetStatus });
  } catch (err) {
    logger.error({ err, id }, 'Error transitioning tender status');
    return NextResponse.json({ error: 'Failed to transition status' }, { status: 500 });
  }
}
