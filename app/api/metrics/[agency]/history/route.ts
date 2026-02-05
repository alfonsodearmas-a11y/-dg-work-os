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
    const limit = parseInt(searchParams.get('limit') || '30');
    const offset = parseInt(searchParams.get('offset') || '0');

    const table = AGENCY_TABLES[agency?.toLowerCase()];
    if (!table) return NextResponse.json({ success: false, error: 'Invalid agency' }, { status: 400 });

    const result = await query(
      `SELECT m.*, s.full_name as submitted_by_name, a.full_name as approved_by_name
       FROM ${table} m LEFT JOIN users s ON m.submitted_by = s.id LEFT JOIN users a ON m.approved_by = a.id
       ORDER BY m.report_date DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
