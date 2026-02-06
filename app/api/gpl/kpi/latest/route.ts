import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    // Get the latest month
    const { data: latestRow } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('report_month')
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestRow) {
      return NextResponse.json({
        success: true,
        hasData: false,
        message: 'No KPI data available',
      });
    }

    const latestMonth = latestRow.report_month;

    // Get all KPIs for the latest month
    const { data: latestData } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('kpi_name, value, report_month')
      .eq('report_month', latestMonth)
      .order('kpi_name');

    // Get previous month's data — find the max month that's less than latestMonth
    const { data: prevRow } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('report_month')
      .lt('report_month', latestMonth)
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousMap: Record<string, number> = {};
    if (prevRow) {
      const { data: prevData } = await supabaseAdmin
        .from('gpl_monthly_kpis')
        .select('kpi_name, value')
        .eq('report_month', prevRow.report_month);

      for (const row of prevData || []) {
        previousMap[row.kpi_name] = parseFloat(row.value);
      }
    }

    // Build kpis map keyed by name
    const kpis: Record<string, { value: number; previousValue: number | null; changePct: number | null }> = {};

    for (const row of latestData || []) {
      const currentValue = parseFloat(row.value);
      const previousValue = previousMap[row.kpi_name] ?? null;
      let changePct: number | null = null;

      if (previousValue !== null && previousValue !== 0) {
        changePct = Math.round(((currentValue - previousValue) / previousValue) * 10000) / 100;
      }

      kpis[row.kpi_name] = { value: currentValue, previousValue, changePct };
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
