import { NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getTenderById, deleteTender } from '@/lib/tender/queries';
import { logger } from '@/lib/logger';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const tender = await getTenderById(id);
    if (!tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    if (!canAccessAgency(session.user.role, session.user.agency, tender.agency)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    return NextResponse.json({ tender });
  } catch (err) {
    logger.error({ err, id }, 'Error fetching tender');
    return NextResponse.json({ error: 'Failed to load tender' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['dg', 'agency_admin']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const tender = await getTenderById(id);
    if (!tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    if (!canAccessAgency(session.user.role, session.user.agency, tender.agency)) {
      return NextResponse.json({ error: 'Cannot delete tenders from another agency' }, { status: 403 });
    }
    await deleteTender(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id }, 'Error deleting tender');
    return NextResponse.json({ error: 'Failed to delete tender' }, { status: 500 });
  }
}
