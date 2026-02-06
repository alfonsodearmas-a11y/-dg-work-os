import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { generateGCAAInsights } from '@/lib/gcaa-insights';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_month, compliance_data, inspection_data, registration_data, incident_data } = body;

    if (!report_month) {
      return NextResponse.json({ success: false, error: 'report_month is required' }, { status: 400 });
    }

    // Normalize month to first of month
    const normalizedMonth = report_month.length === 7 ? `${report_month}-01` : report_month;

    // Build the upsert object with only provided fields
    const upsertData: Record<string, unknown> = {
      report_month: normalizedMonth,
    };

    if (compliance_data) upsertData.compliance_data = compliance_data;
    if (inspection_data) upsertData.inspection_data = inspection_data;
    if (registration_data) upsertData.registration_data = registration_data;
    if (incident_data) upsertData.incident_data = incident_data;

    const { data, error } = await supabaseAdmin
      .from('gcaa_monthly_reports')
      .upsert(upsertData, { onConflict: 'report_month' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Fire-and-forget: generate AI insights
    generateGCAAInsights(normalizedMonth).catch(err =>
      console.error('[gcaa/report/save] Background insights generation failed:', err)
    );

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
