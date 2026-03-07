import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getContractors } from '@/lib/project-queries';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const contractors = await getContractors();
    return NextResponse.json(contractors);
  } catch (error) {
    console.error('Contractors error:', error);
    return NextResponse.json({ error: 'Failed to fetch contractors' }, { status: 500 });
  }
}
