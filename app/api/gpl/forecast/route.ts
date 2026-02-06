import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    // Get the most recent forecast date from gpl_forecast_demand
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
        data: {
          demandForecasts: [],
          capacityTimeline: [],
          loadShedding: null,
          stationReliability: [],
          unitRisk: [],
        },
        message: 'No forecast data available. Run a forecast refresh first.',
      });
    }

    // Fetch all forecast tables in parallel using the latest forecast date
    const [demandResult, capacityResult, loadSheddingResult, stationsResult, unitRiskResult] = await Promise.all([
      supabaseAdmin
        .from('gpl_forecast_demand')
        .select('forecast_date, projected_month, grid, projected_peak_mw, confidence_low_mw, confidence_high_mw, growth_rate_pct, data_source')
        .eq('forecast_date', latestDate)
        .order('grid')
        .order('projected_month'),

      supabaseAdmin
        .from('gpl_forecast_capacity')
        .select('forecast_date, grid, current_capacity_mw, projected_capacity_mw, shortfall_date, reserve_margin_pct, months_until_shortfall, risk_level')
        .eq('forecast_date', latestDate)
        .order('grid'),

      supabaseAdmin
        .from('gpl_forecast_load_shedding')
        .select('forecast_date, period_days, avg_shed_mw, max_shed_mw, shed_days_count, trend, projected_avg_6mo')
        .eq('forecast_date', latestDate)
        .limit(1)
        .maybeSingle(),

      supabaseAdmin
        .from('gpl_forecast_station_reliability')
        .select('forecast_date, station, period_days, uptime_pct, avg_utilization_pct, total_units, online_units, offline_units, failure_count, mtbf_days, trend, risk_level')
        .eq('forecast_date', latestDate)
        .order('station'),

      supabaseAdmin
        .from('gpl_forecast_unit_risk')
        .select('forecast_date, station, engine, unit_number, derated_mw, uptime_pct_90d, failure_count_90d, mtbf_days, days_since_last_failure, predicted_failure_days, risk_level, risk_score')
        .eq('forecast_date', latestDate)
        .order('risk_score', { ascending: false }),
    ]);

    if (demandResult.error) throw demandResult.error;
    if (capacityResult.error) throw capacityResult.error;
    if (loadSheddingResult.error) throw loadSheddingResult.error;
    if (stationsResult.error) throw stationsResult.error;
    if (unitRiskResult.error) throw unitRiskResult.error;

    // Sort station reliability: critical first, then warning, then others
    const riskOrder: Record<string, number> = { critical: 0, warning: 1 };
    const sortedStations = (stationsResult.data || []).sort((a: any, b: any) => {
      const aOrder = riskOrder[a.risk_level] ?? 2;
      const bOrder = riskOrder[b.risk_level] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.station || '').localeCompare(b.station || '');
    });

    return NextResponse.json({
      success: true,
      data: {
        forecastDate: latestDate,
        demandForecasts: demandResult.data || [],
        capacityTimeline: capacityResult.data || [],
        loadShedding: loadSheddingResult.data || null,
        stationReliability: sortedStations,
        unitRisk: unitRiskResult.data || [],
      },
    });
  } catch (error: any) {
    console.error('[gpl-forecast] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch forecast data' },
      { status: 500 }
    );
  }
}
