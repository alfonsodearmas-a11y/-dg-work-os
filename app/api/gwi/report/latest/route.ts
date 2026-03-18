import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { GWI_REPORT_COLUMNS, groupAndMerge } from '@/lib/gwi-report-merge';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Two parallel queries: lightweight months list + data for recent months
    const [monthsResult, dataResult] = await Promise.all([
      supabaseAdmin
        .from('gwi_monthly_reports')
        .select('report_month')
        .order('report_month', { ascending: false })
        .limit(100),
      // 10 rows covers at least 3 months × 3 report types
      supabaseAdmin
        .from('gwi_monthly_reports')
        .select(GWI_REPORT_COLUMNS)
        .order('report_month', { ascending: false })
        .limit(10),
    ]);

    if (monthsResult.error) {
      logger.error({ error: monthsResult.error }, 'GWI report latest: failed to fetch months');
      return NextResponse.json({ success: false, error: 'Failed to fetch report' }, { status: 500 });
    }
    if (dataResult.error) {
      logger.error({ error: dataResult.error }, 'GWI report latest: Supabase query failed');
      return NextResponse.json({ success: false, error: 'Failed to fetch report' }, { status: 500 });
    }

    const availableMonths = [...new Set((monthsResult.data || []).map(r => r.report_month))];
    const merged = groupAndMerge(dataResult.data || []);

    return NextResponse.json({
      success: true,
      data: merged[0] ?? null,
      previous: merged[1] ?? null,
      availableMonths,
    });
  } catch (err: unknown) {
    logger.error({ err }, 'GWI report latest error');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
