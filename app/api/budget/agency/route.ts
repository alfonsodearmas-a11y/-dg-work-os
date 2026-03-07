import { NextRequest, NextResponse } from 'next/server';
import { getAgencyDetail } from '@/lib/budget-db';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Agency code required' }, { status: 400 });
  }

  try {
    const data = getAgencyDetail(code);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Agency detail error:', error);
    return NextResponse.json({ error: 'Failed to load agency detail' }, { status: 500 });
  }
}
