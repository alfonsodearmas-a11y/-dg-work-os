import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
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

    for (const row of data) {
      if (!row.reportMonth || !row.kpiName || row.value === null || row.value === undefined) {
        continue;
      }

      const result = await query(
        `INSERT INTO gpl_monthly_kpis (report_month, kpi_name, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (report_month, kpi_name) DO UPDATE SET value = EXCLUDED.value
         RETURNING (xmax = 0) AS is_insert`,
        [row.reportMonth, row.kpiName, row.value]
      );

      if (result.rows[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `KPI data saved successfully`,
      filename: filename || 'unknown.csv',
      counts: {
        total: data.length,
        inserted,
        updated,
        skipped: data.length - inserted - updated,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error('[gpl-kpi-confirm] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to save KPI data' },
      { status: 500 }
    );
  }
}
