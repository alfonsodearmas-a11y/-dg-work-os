import { NextRequest, NextResponse } from 'next/server';
import { getAgencyDetail } from '@/lib/budget-db';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Agency code required' }, { status: 400 });
  }

  // Agency scoping: non-ministry users can only access their own agency
  const { session } = authResult;
  if (!canAccessAgency(session.user.role, session.user.agency ?? null, code)) {
    return NextResponse.json({ error: 'Access denied for this agency' }, { status: 403 });
  }

  try {
    const data = getAgencyDetail(code);
    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error, agencyCode: code }, 'Failed to load agency detail');
    return NextResponse.json({ error: 'Failed to load agency detail' }, { status: 500 });
  }
}
