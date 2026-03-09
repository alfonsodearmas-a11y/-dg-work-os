import { NextRequest, NextResponse } from 'next/server';
import { searchBudget } from '@/lib/budget-db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const q = request.nextUrl.searchParams.get('q') || '';
  const sector = request.nextUrl.searchParams.get('sector') || '';
  const agency = request.nextUrl.searchParams.get('agency') || '';
  const programme = request.nextUrl.searchParams.get('programme') || '';

  if (!q && !sector && !agency && !programme) {
    return NextResponse.json({ error: 'At least one search parameter required' }, { status: 400 });
  }

  try {
    const results = searchBudget(q, { sector, agency, programme });
    return NextResponse.json(results);
  } catch (error) {
    logger.error({ err: error, q, sector, agency, programme }, 'Budget search failed');
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
