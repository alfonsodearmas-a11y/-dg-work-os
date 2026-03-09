import { NextResponse } from 'next/server';
import { getGplDetail } from '@/lib/budget-db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const data = getGplDetail();
    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error }, 'GPL detail error');
    return NextResponse.json({ error: 'Failed to load GPL detail' }, { status: 500 });
  }
}
