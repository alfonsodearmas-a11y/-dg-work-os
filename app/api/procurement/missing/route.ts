import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { MINISTRY_ROLES } from '@/lib/people-types';
import { listMissingTenders } from '@/lib/tender/queries';
import { supabaseAdmin } from '@/lib/db';
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
 * body: { tender_id, action: 'resurrect' | 'archive' }
 * 'resurrect' flips missing_from_last_upload back to false.
 * 'archive' deletes the tender (only DG).
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
      await supabaseAdmin.from('tender').update({ missing_from_last_upload: false }).eq('id', tenderId);
      await supabaseAdmin.from('tender_field_change').insert({
        tender_id: tenderId,
        field_name: '__presence',
        old_value: 'missing',
        new_value: 'present',
        upload_id: null,
        changed_by: session.user.id,
      });
      return NextResponse.json({ success: true, action: 'resurrect' });
    }

    if (action === 'archive') {
      if (session.user.role !== 'dg') {
        return NextResponse.json({ error: 'Only DG can archive tenders' }, { status: 403 });
      }
      await supabaseAdmin.from('tender').delete().eq('id', tenderId);
      return NextResponse.json({ success: true, action: 'archive' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    logger.error({ err }, 'Error resolving missing tender');
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
