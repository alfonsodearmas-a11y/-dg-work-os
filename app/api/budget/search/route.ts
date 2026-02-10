import { NextRequest, NextResponse } from 'next/server';
import { searchBudget } from '@/lib/budget-db';

export async function GET(request: NextRequest) {
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
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
