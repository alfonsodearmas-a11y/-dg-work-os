import { NextResponse } from 'next/server';
import { getSummary } from '@/lib/budget-db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const data = getSummary();
    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error }, 'Failed to load budget summary');
    return NextResponse.json({ error: 'Failed to load budget summary' }, { status: 500 });
  }
}
