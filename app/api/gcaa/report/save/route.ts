import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { generateGCAAInsights } from '@/lib/gcaa-insights';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const saveReportSchema = z.object({
  report_month: z.string().min(7),
  compliance_data: z.record(z.string(), z.unknown()).optional(),
  inspection_data: z.record(z.string(), z.unknown()).optional(),
  registration_data: z.record(z.string(), z.unknown()).optional(),
  incident_data: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, saveReportSchema);
  if (error) return error;

  const normalizedMonth = data!.report_month.length === 7 ? `${data!.report_month}-01` : data!.report_month;

  const upsertData: Record<string, unknown> = {
    report_month: normalizedMonth,
  };

  if (data!.compliance_data) upsertData.compliance_data = data!.compliance_data;
  if (data!.inspection_data) upsertData.inspection_data = data!.inspection_data;
  if (data!.registration_data) upsertData.registration_data = data!.registration_data;
  if (data!.incident_data) upsertData.incident_data = data!.incident_data;

  const { data: saved, error: dbError } = await supabaseAdmin
    .from('gcaa_monthly_reports')
    .upsert(upsertData, { onConflict: 'report_month' })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ success: false, error: 'Failed to save report' }, { status: 500 });
  }

  generateGCAAInsights(normalizedMonth).catch(err =>
    console.error('[gcaa/report/save] Background insights generation failed:', err)
  );

  return NextResponse.json({ success: true, data: saved });
});
