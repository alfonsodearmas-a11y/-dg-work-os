import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { withErrorHandler } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export const POST = withErrorHandler(async (_request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  if (!canAccessAgency(session.user.role, session.user.agency, 'gpl')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  const userId = session.user.id;
  let result;
  try {
    const { runAllForecasts } = await import('@/lib/gpl-forecasting');
    logger.info({ userId }, 'GPL forecast refresh triggered');
    result = await runAllForecasts();
  } catch (importError: any) {
    logger.error({ err: importError, userId }, 'GPL forecasting module error');
    return NextResponse.json({
      success: false,
      error: `Forecasting module failed: ${importError.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Forecasts refreshed successfully',
    data: {
      demandForecasts: result.demandForecasts.length,
      capacityTimeline: result.capacityTimeline.length,
      loadShedding: result.loadShedding ? 1 : 0,
      stationReliability: result.stationReliability.length,
      unitRisk: result.unitRisk.length,
      kpiForecasts: result.kpiForecasts.length,
    },
    refreshedBy: userId,
    refreshedAt: new Date().toISOString(),
  });
});
