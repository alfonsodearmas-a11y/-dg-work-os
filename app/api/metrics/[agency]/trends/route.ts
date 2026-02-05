import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

const AGENCY_TABLES: Record<string, string> = {
  cjia: 'cjia_daily_metrics',
  gwi: 'gwi_daily_metrics',
  gpl: 'gpl_daily_metrics',
  gcaa: 'gcaa_daily_metrics',
  'gpl-dbis': 'gpl_dbis_daily',
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ agency: string }> }) {
  try {
    const { agency } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');

    const table = AGENCY_TABLES[agency?.toLowerCase()];
    if (!table) return NextResponse.json({ success: false, error: 'Invalid agency' }, { status: 400 });

    const result = await query(
      `SELECT * FROM ${table} WHERE status = 'approved' AND report_date >= CURRENT_DATE - $1::int ORDER BY report_date ASC`,
      [days]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
