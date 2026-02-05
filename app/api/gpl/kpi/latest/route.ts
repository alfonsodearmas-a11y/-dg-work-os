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
        data: null,
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

    const kpis = latestResult.rows.map((row: any) => {
      const currentValue = parseFloat(row.value);
      const previousValue = previousMap[row.kpi_name];
      let change: number | null = null;
      let changePct: number | null = null;

      if (previousValue !== undefined && previousValue !== 0) {
        change = currentValue - previousValue;
        changePct = ((currentValue - previousValue) / previousValue) * 100;
      }

      return {
        kpiName: row.kpi_name,
        value: currentValue,
        reportMonth: row.report_month,
        previousValue: previousValue ?? null,
        change: change !== null ? Math.round(change * 100) / 100 : null,
        changePct: changePct !== null ? Math.round(changePct * 100) / 100 : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        reportMonth: latestMonth,
        kpis,
      },
    });
  } catch (error: any) {
    console.error('[gpl-kpi-latest] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch latest KPIs' },
      { status: 500 }
    );
  }
}
