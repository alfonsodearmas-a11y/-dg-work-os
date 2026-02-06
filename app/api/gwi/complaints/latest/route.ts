import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    // First check weekly reports
    const { data: weeklyData } = await supabaseAdmin
      .from('gwi_weekly_reports')
      .select('*')
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
