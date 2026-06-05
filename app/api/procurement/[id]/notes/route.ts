import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getTenderById, addTenderNote } from '@/lib/tender/queries';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const tender = await getTenderById(id);
    if (!tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    if (!canAccessAgency(session.user.role, session.user.agency, tender.agency)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const body = await request.json();
    const content = String(body?.content ?? '').trim();
    if (!content) return NextResponse.json({ error: 'Content required' }, { status: 400 });
    const note = await addTenderNote(id, content, session.user.id);
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    logger.error({ err, id }, 'Error adding tender note');
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
