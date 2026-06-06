import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { listAwardedTenders } from '@/lib/tender/queries';
import { logger } from '@/lib/logger';

/**
 * GET /api/procurement/archive — awarded tenders.
 *
 * Query params:
 *   ?since=<iso> — filter to tenders whose awarded_at is strictly after the given timestamp
 *                  (used by the "awarded since last upload" banner click-through).
 */
export async function GET(request: NextRequest) {
  const result = await requireRole(['superadmin', 'agency_manager']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const isMinistry = (session.user.role) === 'superadmin';
    const agencyFilter = isMinistry ? undefined : session.user.agency ?? undefined;
    const since = request.nextUrl.searchParams.get('since');

    let tenders = await listAwardedTenders({ agency: agencyFilter });
    if (since) {
      const sinceIso = since;
      tenders = tenders.filter((t) => t.awarded_at && t.awarded_at > sinceIso);
    }
    return NextResponse.json({ tenders, since });
  } catch (err) {
    logger.error({ err }, 'archive: error fetching awarded tenders');
    return NextResponse.json({ error: 'Failed to load awarded tenders' }, { status: 500 });
  }
}
