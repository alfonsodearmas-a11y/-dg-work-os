import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { generateCJIAInsights } from '@/lib/cjia-insights';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_month, operations_data, passenger_data, revenue_data, project_data } = body;

    if (!report_month) {
      return NextResponse.json({ success: false, error: 'report_month is required' }, { status: 400 });
    }

    // Normalize month to first of month
    const normalizedMonth = report_month.length === 7 ? `${report_month}-01` : report_month;

    // Build the upsert object with only provided fields
    const upsertData: Record<string, unknown> = {
      report_month: normalizedMonth,
    };

    if (operations_data) upsertData.operations_data = operations_data;
    if (passenger_data) upsertData.passenger_data = passenger_data;
    if (revenue_data) upsertData.revenue_data = revenue_data;
    if (project_data) upsertData.project_data = project_data;

    const { data, error } = await supabaseAdmin
      .from('cjia_monthly_reports')
      .upsert(upsertData, { onConflict: 'report_month' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Fire-and-forget: generate AI insights
    generateCJIAInsights(normalizedMonth).catch(err =>
      console.error('[cjia/report/save] Background insights generation failed:', err)
    );

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
