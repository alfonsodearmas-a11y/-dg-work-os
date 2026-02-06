import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    // Get the latest forecast date
    const { data: latestRow, error: latestError } = await supabaseAdmin
      .from('gpl_forecast_station_reliability')
      .select('forecast_date')
      .order('forecast_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw latestError;

    const latestDate = latestRow?.forecast_date;

    if (!latestDate) {
      return NextResponse.json({
        success: true,
        data: { forecastDate: null, stations: [] },
        message: 'No station reliability data available',
      });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('gpl_forecast_station_reliability')
      .select('forecast_date, station, period_days, uptime_pct, avg_utilization_pct, total_units, online_units, offline_units, failure_count, mtbf_days, trend, risk_level')
      .eq('forecast_date', latestDate)
      .order('station');

    if (error) throw error;

    // Sort by risk_level: critical first, then warning, then others; then by station name
    const riskOrder: Record<string, number> = { critical: 0, warning: 1 };
    const sortedRows = (rows || []).sort((a: any, b: any) => {
      const aOrder = riskOrder[a.risk_level] ?? 2;
      const bOrder = riskOrder[b.risk_level] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.station || '').localeCompare(b.station || '');
    });

    const stations = sortedRows.map((row: any) => ({
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
