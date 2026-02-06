import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    let result;
    try {
      const { runAllForecasts } = await import('@/lib/gpl-forecasting');
      console.log(`[gpl-forecast-refresh] Triggered by dg-admin`);
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
      refreshedBy: 'dg-admin',
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[gpl-forecast-refresh] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to refresh forecasts' },
      { status: 500 }
    );
  }
}
