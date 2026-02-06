import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    // Get the latest forecast date
    const { data: latestRow, error: latestError } = await supabaseAdmin
      .from('gpl_forecast_capacity')
      .select('forecast_date')
      .order('forecast_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw latestError;

    const latestDate = latestRow?.forecast_date;

    if (!latestDate) {
      return NextResponse.json({
        success: true,
        data: { forecastDate: null, grids: [] },
        message: 'No capacity forecast available',
      });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('gpl_forecast_capacity')
      .select('forecast_date, grid, current_capacity_mw, projected_capacity_mw, shortfall_date, reserve_margin_pct, months_until_shortfall, risk_level')
      .eq('forecast_date', latestDate)
      .order('grid');

    if (error) throw error;

    const grids = (rows || []).map((row: any) => ({
      grid: row.grid,
      currentCapacityMw: parseFloat(row.current_capacity_mw),
      projectedCapacityMw: parseFloat(row.projected_capacity_mw),
      shortfallDate: row.shortfall_date,
      reserveMarginPct: parseFloat(row.reserve_margin_pct),
      monthsUntilShortfall: row.months_until_shortfall,
      riskLevel: row.risk_level,
    }));

    return NextResponse.json({
      success: true,
      data: {
        forecastDate: latestDate,
        grids,
      },
    });
  } catch (error: any) {
    console.error('[gpl-forecast-capacity] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch capacity forecast' },
      { status: 500 }
    );
  }
}
