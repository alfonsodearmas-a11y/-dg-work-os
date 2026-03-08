import { NextRequest, NextResponse } from 'next/server';
import { getEnhancedForecast, getLatestCachedForecast } from '@/lib/gpl-enhanced-forecast';
import { requireRole } from '@/lib/auth-helpers';
import { withErrorHandler } from '@/lib/api-utils';

/**
 * GET /api/gpl/forecast/enhanced
 * Returns cached enhanced forecast or latest available
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

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
    console.error('[forecast/enhanced] GET error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch enhanced forecast' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler(async (_request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

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
