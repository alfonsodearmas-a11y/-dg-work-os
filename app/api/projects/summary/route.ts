import { NextResponse } from 'next/server';
import { getPortfolioSummary } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const summary = await getPortfolioSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
