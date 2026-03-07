import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';

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
      .from('cjia_monthly_reports')
      .select('*')
      .eq('report_month', normalizedMonth)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    console.error('[cjia/report] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
