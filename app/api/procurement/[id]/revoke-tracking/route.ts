import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db-admin';
import { recordDecision } from '@/lib/procurement/decisions';
import { logger } from '@/lib/logger';

/**
 * POST /api/procurement/[id]/revoke-tracking
 * body: { reason_text? }
 *
 * Inverse of Resurrect's sticky semantics: clears keep_tracking_despite_missing
 * so the next upload that doesn't contain this tender will flip
 * missing_from_last_upload back on. Lives on the tender detail view, not in
 * the inbox — the assumption is that this is a deliberate, infrequent
 * correction (per the brainstorm: "the unstick semantic has no current
 * use case", but the data shape accommodates it for completeness).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json().catch(() => ({}));
    const reasonText = (body?.reason_text as string | undefined) ?? null;

    const { data: tender, error: fetchErr } = await supabaseAdmin
      .from('tender')
      .select('agency, keep_tracking_despite_missing')
      .eq('id', id)
      .single();
    if (fetchErr || !tender) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }
    if (!tender.keep_tracking_despite_missing) {
      return NextResponse.json({ error: 'Tender is not sticky-tracked' }, { status: 409 });
    }

    await supabaseAdmin
      .from('tender')
      .update({ keep_tracking_despite_missing: false })
      .eq('id', id);

    await recordDecision({
      decision_type: 'revoke_tracking',
      target_kind: 'tender',
      target_id: id,
      agency: tender.agency as string,
      actor_id: session.user.id,
      actor_role: session.user.role,
      reason_code: null,
      reason_text: reasonText,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id }, 'Error revoking sticky tracking');
    return NextResponse.json({ error: 'Failed to revoke tracking' }, { status: 500 });
  }
}
