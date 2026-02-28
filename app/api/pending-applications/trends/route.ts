import { NextRequest, NextResponse } from 'next/server';
import { getSnapshots } from '@/lib/pending-applications-snapshots';

export async function GET(request: NextRequest) {
  try {
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
