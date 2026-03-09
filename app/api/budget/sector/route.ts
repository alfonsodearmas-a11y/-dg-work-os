import { NextRequest, NextResponse } from 'next/server';
import { getSectorDetail } from '@/lib/budget-db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const sector = request.nextUrl.searchParams.get('sector');
  if (!sector) {
    return NextResponse.json({ error: 'Sector required' }, { status: 400 });
  }

  try {
    const data = getSectorDetail(sector);
    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error, sector }, 'Failed to load sector detail');
    return NextResponse.json({ error: 'Failed to load sector detail' }, { status: 500 });
  }
}
