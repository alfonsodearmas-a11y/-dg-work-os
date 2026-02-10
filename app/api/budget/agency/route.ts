import { NextRequest, NextResponse } from 'next/server';
import { getAgencyDetail } from '@/lib/budget-db';

export async function GET(request: NextRequest) {
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
