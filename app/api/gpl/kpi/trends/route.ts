import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Default to 24 months of data; allow override via query param
    const { searchParams } = new URL(request.url);
    const months = Math.min(60, Math.max(1, parseInt(searchParams.get('months') || '24', 10)));
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 7); // YYYY-MM

    const { data, error } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('report_month, kpi_name, value')
      .gte('report_month', cutoffStr)
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
    logger.error({ err: error }, 'Failed to fetch KPI trends');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch KPI trends' },
      { status: 500 }
    );
  }
}
