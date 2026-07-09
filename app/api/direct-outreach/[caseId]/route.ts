import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess } from '@/lib/auth-helpers';
import { getCase } from '@/lib/direct-outreach/queries';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const authResult = await requireModuleAccess('direct-outreach');
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { caseId } = await params;
  if (!/^\d+$/.test(caseId)) {
    return NextResponse.json({ error: 'Invalid case ID' }, { status: 400 });
  }
  // case_id is int4; an oversized numeric ID would fail at Bind with a 500.
  // 404 (not 400) keeps nonexistent and impossible IDs indistinguishable.
  const caseIdNum = Number(caseId);
  if (!Number.isSafeInteger(caseIdNum) || caseIdNum > 2147483647) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // agency_manager sees only their own agency's cases (404, not 403, so the
  // scoped route doesn't leak which case IDs exist for other agencies).
  const agencyScope =
    session.user.role === 'agency_manager'
      ? (session.user.agency || 'NONE').toUpperCase()
      : undefined;

  try {
    const detail = await getCase(caseIdNum, agencyScope);
    if (!detail) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    logger.error({ err, caseId }, '[direct-outreach] case detail failed');
    return NextResponse.json({ error: 'Failed to load case' }, { status: 500 });
  }
}
