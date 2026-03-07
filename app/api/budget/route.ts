import { NextResponse } from 'next/server';
import { getSummary } from '@/lib/budget-db';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const data = getSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Budget summary error:', error);
    return NextResponse.json({ error: 'Failed to load budget summary' }, { status: 500 });
  }
}
