import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

export async function GET() {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // First check weekly reports
    const { data: weeklyData } = await supabaseAdmin
      .from('gwi_weekly_reports')
      .select('complaints_data, report_week')
      .order('report_week', { ascending: false })
      .limit(1)
      .single();

    // Also get customer service data from latest monthly report
    const { data: monthlyData } = await supabaseAdmin
      .from('gwi_monthly_reports')
      .select('customer_service_data, report_month')
      .order('report_month', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        weekly: weeklyData?.complaints_data || null,
        weekly_date: weeklyData?.report_week || null,
        monthly: monthlyData?.customer_service_data || null,
        monthly_date: monthlyData?.report_month || null,
      },
    });
  } catch (err: unknown) {
    logger.error({ err }, 'GWI complaints latest error');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
