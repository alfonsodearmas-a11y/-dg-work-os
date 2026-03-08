import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { generateGWIInsights } from '@/lib/gwi-insights';
import { requireRole } from '@/lib/auth-helpers';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const saveReportSchema = z.object({
  report_month: z.string().min(7),
  report_type: z.string().optional(),
  financial_data: z.record(z.string(), z.unknown()).optional(),
  collections_data: z.record(z.string(), z.unknown()).optional(),
  customer_service_data: z.record(z.string(), z.unknown()).optional(),
  procurement_data: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await parseBody(request, saveReportSchema);
  if (error) return error;

  const normalizedMonth = data!.report_month.length === 7 ? `${data!.report_month}-01` : data!.report_month;

  const upsertData: Record<string, unknown> = {
    report_month: normalizedMonth,
    report_type: data!.report_type || 'management',
  };

  if (data!.financial_data) upsertData.financial_data = data!.financial_data;
  if (data!.collections_data) upsertData.collections_data = data!.collections_data;
  if (data!.customer_service_data) upsertData.customer_service_data = data!.customer_service_data;
  if (data!.procurement_data) upsertData.procurement_data = data!.procurement_data;

  const { data: saved, error: dbError } = await supabaseAdmin
    .from('gwi_monthly_reports')
    .upsert(upsertData, { onConflict: 'report_month,report_type' })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ success: false, error: 'Failed to save report' }, { status: 500 });
  }

  generateGWIInsights(normalizedMonth).catch(err =>
    console.error('[gwi/report/save] Background insights generation failed:', err)
  );

  return NextResponse.json({ success: true, data: saved });
});
