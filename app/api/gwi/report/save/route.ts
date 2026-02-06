import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { generateGWIInsights } from '@/lib/gwi-insights';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_month, report_type, financial_data, collections_data, customer_service_data, procurement_data } = body;

    if (!report_month) {
      return NextResponse.json({ success: false, error: 'report_month is required' }, { status: 400 });
    }

    // Normalize month to first of month
    const normalizedMonth = report_month.length === 7 ? `${report_month}-01` : report_month;

    // Build the upsert object with only provided fields
    const upsertData: Record<string, unknown> = {
      report_month: normalizedMonth,
      report_type: report_type || 'management',
    };

    if (financial_data) upsertData.financial_data = financial_data;
    if (collections_data) upsertData.collections_data = collections_data;
    if (customer_service_data) upsertData.customer_service_data = customer_service_data;
    if (procurement_data) upsertData.procurement_data = procurement_data;

    const { data, error } = await supabaseAdmin
      .from('gwi_monthly_reports')
      .upsert(upsertData, { onConflict: 'report_month,report_type' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Fire-and-forget: generate AI insights
    generateGWIInsights(normalizedMonth).catch(err =>
      console.error('[gwi/report/save] Background insights generation failed:', err)
    );

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
