import { NextRequest, NextResponse } from 'next/server';
import { getProjectFunding } from '@/lib/project-queries';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const funding = await getProjectFunding(id);
    return NextResponse.json(funding);
  } catch (error) {
    console.error('Funding fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch funding data' }, { status: 500 });
  }
}
