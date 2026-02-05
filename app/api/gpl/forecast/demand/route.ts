import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    // Get the latest forecast date
    const latestDateResult = await query(
      `SELECT MAX(forecast_date) AS latest FROM gpl_forecast_demand`
    );
    const latestDate = latestDateResult.rows[0]?.latest;

    if (!latestDate) {
      return NextResponse.json({
        success: true,
        data: { forecastDate: null, grids: {} },
        message: 'No demand forecast available',
      });
    }

    const result = await query(
      `SELECT forecast_date, projected_month, grid, projected_peak_mw, confidence_low_mw, confidence_high_mw, growth_rate_pct, data_source
       FROM gpl_forecast_demand
       WHERE forecast_date = $1
       ORDER BY grid, projected_month`,
      [latestDate]
    );

    // Group by grid
    const byGrid: Record<string, any[]> = {};
    for (const row of result.rows) {
      if (!byGrid[row.grid]) byGrid[row.grid] = [];
      byGrid[row.grid].push({
        projectedMonth: row.projected_month,
        projectedPeakMw: parseFloat(row.projected_peak_mw),
        confidenceLowMw: parseFloat(row.confidence_low_mw),
        confidenceHighMw: parseFloat(row.confidence_high_mw),
        growthRatePct: parseFloat(row.growth_rate_pct),
        dataSource: row.data_source,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        forecastDate: latestDate,
        grids: byGrid,
        totalProjections: result.rows.length,
      },
    });
  } catch (error: any) {
    console.error('[gpl-forecast-demand] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch demand forecast' },
      { status: 500 }
    );
  }
}
