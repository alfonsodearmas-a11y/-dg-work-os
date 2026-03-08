import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db';
import { requireRole, canUploadData } from '@/lib/auth-helpers';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const kpiConfirmSchema = z.object({
  data: z.array(z.object({
    reportMonth: z.string().optional(),
    kpiName: z.string().optional(),
    value: z.number().nullable().optional(),
  })).min(1),
  filename: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const result = await requireRole(['dg', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  if (!canUploadData(session.user.role, session.user.agency, 'GPL')) return NextResponse.json({ error: 'Cannot upload GPL data' }, { status: 403 });

  const { data: body, error } = await parseBody(request, kpiConfirmSchema);
  if (error) return error;

  const { data, filename } = body!;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of data) {
    if (!row.reportMonth || !row.kpiName || row.value === null || row.value === undefined) {
      skipped++;
      continue;
    }

    const { data: existing, error: selectErr } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('id')
      .eq('report_month', row.reportMonth)
      .eq('kpi_name', row.kpiName)
      .maybeSingle();

    if (selectErr) throw selectErr;

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('gpl_monthly_kpis')
        .update({ value: row.value })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
      updated++;
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('gpl_monthly_kpis')
        .insert({
          report_month: row.reportMonth,
          kpi_name: row.kpiName,
          value: row.value,
        });
      if (insertErr) throw insertErr;
      inserted++;
    }
  }

  return NextResponse.json({
    success: true,
    message: 'KPI data saved successfully',
    filename: filename || 'unknown.csv',
    counts: {
      total: data.length,
      inserted,
      updated,
      skipped,
    },
  });
});
