import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { getPackageSummary, addNote } from '@/lib/procurement-queries';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const { id } = await params;

  try {
    // Lightweight check: verify package exists and user has access
    const pkg = await getPackageSummary(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
    }

    if (!canAccessAgency(session.user.role, session.user.agency, pkg.agency)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { content } = body as { content: string };

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }

    const note = await addNote(id, content.trim(), session.user.id);

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    logger.error({ err }, 'procurement-notes: error adding note');
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
