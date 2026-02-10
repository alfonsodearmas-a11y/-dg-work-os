import { NextRequest, NextResponse } from 'next/server';
import { getSectorDetail } from '@/lib/budget-db';

export async function GET(request: NextRequest) {
  const sector = request.nextUrl.searchParams.get('sector');
  if (!sector) {
    return NextResponse.json({ error: 'Sector required' }, { status: 400 });
  }

  try {
    const data = getSectorDetail(sector);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Sector detail error:', error);
    return NextResponse.json({ error: 'Failed to load sector detail' }, { status: 500 });
  }
}
