import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { listArchivedTenders, unarchiveTender } from '@/lib/tender/queries';
import { supabaseAdmin } from '@/lib/db';
import { recordDecision } from '@/lib/procurement/decisions';
import { logger } from '@/lib/logger';

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const isMinistry = MINISTRY_ROLES.includes(session.user.role);
    const agency = isMinistry ? undefined : session.user.agency ?? undefined;
    const tenders = await listArchivedTenders({ agency });
    return NextResponse.json({ tenders });
  } catch (err) {
    logger.error({ err }, 'Error listing archived tenders');
    return NextResponse.json({ error: 'Failed to list archived tenders' }, { status: 500 });
  }
}

/**
 * POST /api/procurement/archived
 * body: { tender_id, action: 'unarchive', reason_text? }
 * Reverses a soft archive. DG only. Records a procurement_decision row.
 */
export async function POST(request: NextRequest) {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const tenderId = body?.tender_id as string | undefined;
    const action = body?.action as string | undefined;
    const reasonText = (body?.reason_text as string | undefined) ?? null;
    if (!tenderId || action !== 'unarchive') {
      return NextResponse.json({ error: 'tender_id and action=unarchive are required' }, { status: 400 });
    }

    const { data: tender, error: fetchErr } = await supabaseAdmin
      .from('tender')
      .select('agency, archived_at')
      .eq('id', tenderId)
      .single();
    if (fetchErr || !tender) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }
    if (!tender.archived_at) {
      return NextResponse.json({ error: 'Tender is not archived' }, { status: 409 });
    }

    await unarchiveTender(tenderId);

    await recordDecision({
      decision_type: 'unarchive',
      target_kind: 'tender',
      target_id: tenderId,
      agency: tender.agency as string,
      actor_id: session.user.id,
      actor_role: session.user.role,
      reason_code: null,
      reason_text: reasonText,
    });

    return NextResponse.json({ success: true, action: 'unarchive' });
  } catch (err) {
    logger.error({ err }, 'Error unarchiving tender');
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
