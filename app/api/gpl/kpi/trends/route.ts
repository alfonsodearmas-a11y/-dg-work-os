import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('report_month, kpi_name, value')
      .order('report_month', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ success: true, trends: [] });
    }

    // Group by month — each row becomes { month, 'Peak Demand DBIS': value, ... }
    const byMonth: Record<string, Record<string, number | string>> = {};

    for (const row of data) {
      const month = String(row.report_month);
      if (!byMonth[month]) byMonth[month] = { month };
      byMonth[month][row.kpi_name] = parseFloat(row.value);
    }

    const trends = Object.values(byMonth).sort((a, b) =>
      String(a.month).localeCompare(String(b.month))
    );

    return NextResponse.json({ success: true, trends });
  } catch (error: any) {
    console.error('[gpl-kpi-trends] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch KPI trends' },
      { status: 500 }
    );
  }
}
