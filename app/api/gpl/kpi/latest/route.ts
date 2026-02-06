import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    // Get the latest month that has KPI data
    const latestMonthResult = await query(
      `SELECT MAX(report_month) AS latest_month FROM gpl_monthly_kpis`
    );

    const latestMonth = latestMonthResult.rows[0]?.latest_month;
    if (!latestMonth) {
      return NextResponse.json({
        success: true,
        hasData: false,
        message: 'No KPI data available',
      });
    }

    // Get all KPIs for the latest month
    const latestResult = await query(
      `SELECT kpi_name, value, report_month
       FROM gpl_monthly_kpis
       WHERE report_month = $1
       ORDER BY kpi_name`,
      [latestMonth]
    );

    // Get the previous month's data for month-over-month comparison
    const previousResult = await query(
      `SELECT kpi_name, value, report_month
       FROM gpl_monthly_kpis
       WHERE report_month = (
         SELECT MAX(report_month) FROM gpl_monthly_kpis
         WHERE report_month < $1
       )
       ORDER BY kpi_name`,
      [latestMonth]
    );

    // Build comparison map
    const previousMap: Record<string, number> = {};
    for (const row of previousResult.rows) {
      previousMap[row.kpi_name] = parseFloat(row.value);
    }

    // Build kpis as a map keyed by kpi_name (what component expects)
    const kpis: Record<string, { value: number; previousValue: number | null; changePct: number | null }> = {};

    for (const row of latestResult.rows) {
      const currentValue = parseFloat(row.value);
      const previousValue = previousMap[row.kpi_name] ?? null;
      let changePct: number | null = null;

      if (previousValue !== null && previousValue !== 0) {
        changePct = Math.round(((currentValue - previousValue) / previousValue) * 10000) / 100;
      }

      kpis[row.kpi_name] = {
        value: currentValue,
        previousValue,
        changePct,
      };
    }

    return NextResponse.json({
      success: true,
      hasData: true,
      reportMonth: latestMonth,
      kpis,
    });
  } catch (error: any) {
    console.error('[gpl-kpi-latest] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch latest KPIs' },
      { status: 500 }
    );
  }
}
