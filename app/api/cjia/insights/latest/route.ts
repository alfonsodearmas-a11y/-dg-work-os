import { NextResponse } from 'next/server';
import { getLatestCJIAInsights } from '@/lib/cjia-insights';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const insights = await getLatestCJIAInsights();

    if (!insights) {
      return NextResponse.json({ success: true, data: null, hasInsights: false });
    }

    return NextResponse.json({ success: true, data: insights, hasInsights: true });
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to fetch latest CJIA insights');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
