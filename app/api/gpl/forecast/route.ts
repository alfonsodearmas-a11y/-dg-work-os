import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    // Try to get the most recent forecast date for cached data
    const latestDateResult = await query(
      `SELECT MAX(forecast_date) AS latest FROM gpl_forecast_demand`
    );
    const latestDate = latestDateResult.rows[0]?.latest;

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
    const [demand, capacity, loadShedding, stations, unitRisk] = await Promise.all([
      query(
        `SELECT forecast_date, projected_month, grid, projected_peak_mw, confidence_low_mw, confidence_high_mw, growth_rate_pct, data_source
         FROM gpl_forecast_demand
         WHERE forecast_date = $1
         ORDER BY grid, projected_month`,
        [latestDate]
      ),
      query(
        `SELECT forecast_date, grid, current_capacity_mw, projected_capacity_mw, shortfall_date, reserve_margin_pct, months_until_shortfall, risk_level
         FROM gpl_forecast_capacity
         WHERE forecast_date = $1
         ORDER BY grid`,
        [latestDate]
      ),
      query(
        `SELECT forecast_date, period_days, avg_shed_mw, max_shed_mw, shed_days_count, trend, projected_avg_6mo
         FROM gpl_forecast_load_shedding
         WHERE forecast_date = $1
         LIMIT 1`,
        [latestDate]
      ),
      query(
        `SELECT forecast_date, station, period_days, uptime_pct, avg_utilization_pct, total_units, online_units, offline_units, failure_count, mtbf_days, trend, risk_level
         FROM gpl_forecast_station_reliability
         WHERE forecast_date = $1
         ORDER BY risk_level, station`,
        [latestDate]
      ),
      query(
        `SELECT forecast_date, station, engine, unit_number, derated_mw, uptime_pct_90d, failure_count_90d, mtbf_days, days_since_last_failure, predicted_failure_days, risk_level, risk_score
         FROM gpl_forecast_unit_risk
         WHERE forecast_date = $1
         ORDER BY risk_score DESC`,
        [latestDate]
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        forecastDate: latestDate,
        demandForecasts: demand.rows,
        capacityTimeline: capacity.rows,
        loadShedding: loadShedding.rows[0] || null,
        stationReliability: stations.rows,
        unitRisk: unitRisk.rows,
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
