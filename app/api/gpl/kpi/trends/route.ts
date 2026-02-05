import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    // Get the last 24 months of KPI data
    const result = await query(
      `SELECT report_month, kpi_name, value
       FROM gpl_monthly_kpis
       WHERE report_month >= (
         SELECT MAX(report_month) - INTERVAL '24 months'
         FROM gpl_monthly_kpis
       )
       ORDER BY report_month ASC, kpi_name`
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          months: [],
          kpis: {},
          totalMonths: 0,
        },
      });
    }

    // Group by month
    const byMonth: Record<string, Record<string, number>> = {};
    const allKpis = new Set<string>();

    for (const row of result.rows) {
      const month = row.report_month instanceof Date
        ? row.report_month.toISOString().split('T')[0]
        : String(row.report_month);

      if (!byMonth[month]) byMonth[month] = {};
      byMonth[month][row.kpi_name] = parseFloat(row.value);
      allKpis.add(row.kpi_name);
    }

    const months = Object.keys(byMonth).sort();

    // Also group by KPI for time-series format
    const byKpi: Record<string, { month: string; value: number }[]> = {};
    for (const kpi of allKpis) {
      byKpi[kpi] = [];
      for (const month of months) {
        if (byMonth[month][kpi] !== undefined) {
          byKpi[kpi].push({ month, value: byMonth[month][kpi] });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        months,
        byMonth,
        kpis: byKpi,
        kpiNames: Array.from(allKpis).sort(),
        totalMonths: months.length,
      },
    });
  } catch (error: any) {
    console.error('[gpl-kpi-trends] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch KPI trends' },
      { status: 500 }
    );
  }
}
