import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

const REPORT_COLUMNS = 'id, report_month, report_type, financial_data, collections_data, customer_service_data, procurement_data, ai_insights, created_at, updated_at';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { month } = await params;

  try {
    // Accept YYYY-MM or YYYY-MM-DD, normalize to first of month
    const normalizedMonth = month.length === 7 ? `${month}-01` : month;

    const { data, error } = await supabaseAdmin
      .from('gwi_monthly_reports')
      .select(REPORT_COLUMNS)
      .eq('report_month', normalizedMonth)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    logger.error({ err, month }, 'GWI report fetch failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
