import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Get the latest forecast date
    const { data: latestRow, error: latestError } = await supabaseAdmin
      .from('gpl_forecast_demand')
      .select('forecast_date')
      .order('forecast_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw latestError;

    const latestDate = latestRow?.forecast_date;

    if (!latestDate) {
      return NextResponse.json({
        success: true,
        data: { forecastDate: null, grids: {} },
        message: 'No demand forecast available',
      });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('gpl_forecast_demand')
      .select('forecast_date, projected_month, grid, projected_peak_mw, confidence_low_mw, confidence_high_mw, growth_rate_pct, data_source')
      .eq('forecast_date', latestDate)
      .order('grid')
      .order('projected_month');

    if (error) throw error;

    // Group by grid
    const byGrid: Record<string, any[]> = {};
    for (const row of rows || []) {
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
        totalProjections: (rows || []).length,
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
