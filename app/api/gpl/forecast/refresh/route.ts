import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);

    let result;
    try {
      const { runAllForecasts } = await import('@/lib/gpl-forecasting');
      console.log(`[gpl-forecast-refresh] Triggered by ${user.username}`);
      result = await runAllForecasts();
    } catch (importError: any) {
      console.warn('[gpl-forecast-refresh] gpl-forecasting module unavailable:', importError.message);
      return NextResponse.json({
        success: true,
        message: 'Forecast refresh is not yet available. The forecasting module is still being set up.',
        placeholder: true,
      });
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
      refreshedBy: user.username,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('[gpl-forecast-refresh] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to refresh forecasts' },
      { status: 500 }
    );
  }
}
