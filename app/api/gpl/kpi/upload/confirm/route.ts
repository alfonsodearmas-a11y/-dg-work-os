import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, filename } = body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No KPI data provided' },
        { status: 400 }
      );
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of data) {
      if (!row.reportMonth || !row.kpiName || row.value === null || row.value === undefined) {
        skipped++;
        continue;
      }

      // Check if row exists
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
  } catch (error: any) {
    console.error('[gpl-kpi-confirm] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to save KPI data' },
      { status: 500 }
    );
  }
}
