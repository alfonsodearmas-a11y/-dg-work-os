import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    // Get the latest forecast date
    const latestDateResult = await query(
      `SELECT MAX(forecast_date) AS latest FROM gpl_forecast_station_reliability`
    );
    const latestDate = latestDateResult.rows[0]?.latest;

    if (!latestDate) {
      return NextResponse.json({
        success: true,
        data: { forecastDate: null, stations: [] },
        message: 'No station reliability data available',
      });
    }

    const result = await query(
      `SELECT forecast_date, station, period_days, uptime_pct, avg_utilization_pct, total_units, online_units, offline_units, failure_count, mtbf_days, trend, risk_level
       FROM gpl_forecast_station_reliability
       WHERE forecast_date = $1
       ORDER BY
         CASE risk_level
           WHEN 'critical' THEN 0
           WHEN 'warning' THEN 1
           ELSE 2
         END,
         station`,
      [latestDate]
    );

    const stations = result.rows.map((row: any) => ({
      station: row.station,
      periodDays: row.period_days,
      uptimePct: parseFloat(row.uptime_pct),
      avgUtilizationPct: parseFloat(row.avg_utilization_pct),
      totalUnits: row.total_units,
      onlineUnits: row.online_units,
      offlineUnits: row.offline_units,
      failureCount: row.failure_count,
      mtbfDays: parseFloat(row.mtbf_days),
      trend: row.trend,
      riskLevel: row.risk_level,
    }));

    return NextResponse.json({
      success: true,
      data: {
        forecastDate: latestDate,
        stations,
        totalStations: stations.length,
        criticalCount: stations.filter((s: any) => s.riskLevel === 'critical').length,
        warningCount: stations.filter((s: any) => s.riskLevel === 'warning').length,
      },
    });
  } catch (error: any) {
    console.error('[gpl-forecast-stations] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch station reliability data' },
      { status: 500 }
    );
  }
}
