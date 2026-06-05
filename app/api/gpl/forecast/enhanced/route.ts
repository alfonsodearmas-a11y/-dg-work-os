import { NextRequest, NextResponse } from 'next/server';
import { getEnhancedForecast, getLatestCachedForecast } from '@/lib/gpl-enhanced-forecast';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/gpl/forecast/enhanced
 * Returns cached enhanced forecast or latest available
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    // Try to get forecast (uses cache if data hasn't changed)
    const result = await getEnhancedForecast(false);

    if (result.success && result.forecast) {
      return NextResponse.json({
        success: true,
        forecast: result.forecast,
        cached: result.cached ?? false,
      });
    }

    // If main fetch failed, try to get any cached version
    const fallback = await getLatestCachedForecast();
    if (fallback) {
      return NextResponse.json({
        success: true,
        forecast: fallback,
        cached: true,
        stale: true,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'No forecast available' },
      { status: result.error?.includes('Insufficient') ? 422 : 500 }
    );
  } catch (error: any) {
    logger.error({ err: error }, 'Enhanced forecast GET error');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch enhanced forecast' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler(async (_request: NextRequest) => {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;
  const { session: postSession } = authResult;
  if (!canAccessAgency(postSession.user.role, postSession.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const result = await getEnhancedForecast(true);

  if (result.success && result.forecast) {
    return NextResponse.json({
      success: true,
      forecast: result.forecast,
      regenerated: true,
    });
  }

  return NextResponse.json(
    { success: false, error: result.error || 'Failed to generate forecast' },
    { status: 500 }
  );
});
