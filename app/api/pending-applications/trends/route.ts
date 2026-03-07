import { NextRequest, NextResponse } from 'next/server';
import { getSnapshots } from '@/lib/pending-applications-snapshots';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = request.nextUrl;
    const agencyParam = searchParams.get('agency')?.toUpperCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

    const agency = (agencyParam === 'GPL' || agencyParam === 'GWI') ? agencyParam : undefined;
    const snapshots = await getSnapshots(agency, limit);

    return NextResponse.json({ snapshots });
  } catch (err) {
    console.error('[pending-applications/trends] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
