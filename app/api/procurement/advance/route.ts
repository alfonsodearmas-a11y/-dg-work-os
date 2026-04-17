import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getTenderById, updateTenderStage } from '@/lib/tender/queries';
import { TENDER_STAGES, type TenderStage } from '@/lib/tender/types';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const body = await request.json();
    const tenderId = body?.tenderId ?? body?.packageId; // back-compat for old client code
    const newStage = body?.newStage;
    if (!tenderId || !newStage) {
      return NextResponse.json({ error: 'tenderId and newStage are required' }, { status: 400 });
    }
    if (!TENDER_STAGES.includes(newStage as TenderStage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    const existing = await getTenderById(tenderId);
    if (!existing) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });

    if (!canAccessAgency(session.user.role, session.user.agency, existing.agency)) {
      return NextResponse.json({ error: 'Cannot advance tenders from another agency' }, { status: 403 });
    }
    if (existing.stage === newStage) {
      return NextResponse.json({ error: 'Tender is already at this stage' }, { status: 400 });
    }

    const updated = await updateTenderStage(tenderId, newStage as TenderStage, session.user.id);
    return NextResponse.json({ tender: updated });
  } catch (err) {
    logger.error({ err }, 'tender-advance: error advancing stage');
    return NextResponse.json({ error: 'Failed to advance tender' }, { status: 500 });
  }
}
