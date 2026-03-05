import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id || 'system';
    let result;
    try {
      const { runAllForecasts } = await import('@/lib/gpl-forecasting');
      console.log(`[gpl-forecast-refresh] Triggered by ${userId}`);
      result = await runAllForecasts();
    } catch (importError: any) {
      console.error('[gpl-forecast-refresh] gpl-forecasting module error:', importError.message);
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
  } catch (error: any) {
    console.error('[gpl-forecast-refresh] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to refresh forecasts' },
      { status: 500 }
    );
  }
}
