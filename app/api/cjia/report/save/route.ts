import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { generateCJIAInsights } from '@/lib/cjia-insights';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const saveReportSchema = z.object({
  report_month: z.string().min(7),
  operations_data: z.record(z.string(), z.unknown()).optional(),
  passenger_data: z.record(z.string(), z.unknown()).optional(),
  revenue_data: z.record(z.string(), z.unknown()).optional(),
  project_data: z.record(z.string(), z.unknown()).optional(),
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

  if (data!.operations_data) upsertData.operations_data = data!.operations_data;
  if (data!.passenger_data) upsertData.passenger_data = data!.passenger_data;
  if (data!.revenue_data) upsertData.revenue_data = data!.revenue_data;
  if (data!.project_data) upsertData.project_data = data!.project_data;

  const { data: saved, error: dbError } = await supabaseAdmin
    .from('cjia_monthly_reports')
    .upsert(upsertData, { onConflict: 'report_month' })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ success: false, error: 'Failed to save report' }, { status: 500 });
  }

  generateCJIAInsights(normalizedMonth).catch(err =>
    console.error('[cjia/report/save] Background insights generation failed:', err)
  );

  return NextResponse.json({ success: true, data: saved });
});
