import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    // Get the latest forecast date
    const latestDateResult = await query(
      `SELECT MAX(forecast_date) AS latest FROM gpl_forecast_capacity`
    );
    const latestDate = latestDateResult.rows[0]?.latest;

    if (!latestDate) {
      return NextResponse.json({
        success: true,
        data: { forecastDate: null, grids: [] },
        message: 'No capacity forecast available',
      });
    }

    const result = await query(
      `SELECT forecast_date, grid, current_capacity_mw, projected_capacity_mw, shortfall_date, reserve_margin_pct, months_until_shortfall, risk_level
       FROM gpl_forecast_capacity
       WHERE forecast_date = $1
       ORDER BY grid`,
      [latestDate]
    );

    const grids = result.rows.map((row: any) => ({
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
