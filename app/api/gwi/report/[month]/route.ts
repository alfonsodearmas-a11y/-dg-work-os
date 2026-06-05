import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { mergeReportTypes, GWI_REPORT_COLUMNS } from '@/lib/gwi-report-merge';
import { logger } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const authResult = await requireRole(['superadmin', 'agency_manager']);
  if (authResult instanceof NextResponse) return authResult;

  const { month } = await params;

  try {
    // Accept YYYY-MM or YYYY-MM-DD, normalize to first of month
    const normalizedMonth = month.length === 7 ? `${month}-01` : month;

    // Fetch ALL report types for this month and merge
    const { data, error } = await supabaseAdmin
      .from('gwi_monthly_reports')
      .select(GWI_REPORT_COLUMNS)
      .eq('report_month', normalizedMonth);

    if (error) {
      logger.error({ error, month: normalizedMonth }, 'GWI report by month: Supabase query failed');
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }

    const merged = mergeReportTypes(data || []);
    if (!merged) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: merged });
  } catch (err: unknown) {
    logger.error({ err, month }, 'GWI report fetch failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
