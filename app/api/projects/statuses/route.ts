import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getDistinctStatuses } from '@/lib/project-queries';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const statuses = await getDistinctStatuses();
    return NextResponse.json(statuses);
  } catch (error) {
    console.error('Statuses error:', error);
    return NextResponse.json({ error: 'Failed to fetch statuses' }, { status: 500 });
  }
}
