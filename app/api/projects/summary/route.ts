import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioSummary } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const p = request.nextUrl.searchParams;

    const agencies = p.get('agencies') ? p.get('agencies')!.split(',').filter(Boolean) : undefined;
    const statuses = p.get('statuses') ? p.get('statuses')!.split(',').filter(Boolean) : undefined;
    const regions = p.get('regions') ? p.get('regions')!.split(',').filter(Boolean) : undefined;
    const healths = p.get('healths') ? p.get('healths')!.split(',').filter(Boolean) : undefined;

    const summary = await getPortfolioSummary({
      agencies,
      statuses,
      regions,
      healths,
      budgetMin: p.get('budgetMin') ? Number(p.get('budgetMin')) : undefined,
      budgetMax: p.get('budgetMax') ? Number(p.get('budgetMax')) : undefined,
      contractor: p.get('contractor') || undefined,
      search: p.get('search') || undefined,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
