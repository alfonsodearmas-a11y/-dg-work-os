import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

const ALL_TABLES: Record<string, string> = {
  cjia: 'cjia_daily_metrics',
  gwi: 'gwi_daily_metrics',
  gpl: 'gpl_daily_metrics',
  gcaa: 'gcaa_daily_metrics',
  'gpl-dbis': 'gpl_dbis_daily',
};

export async function GET(request: NextRequest) {
  try {
    const pending: Record<string, any[]> = {};

    for (const [agency, table] of Object.entries(ALL_TABLES)) {
      const result = await query(
        `SELECT m.*, u.full_name as submitted_by_name FROM ${table} m LEFT JOIN users u ON m.submitted_by = u.id WHERE m.status = 'pending' ORDER BY m.report_date DESC`
      );
      pending[agency] = result.rows;
    }

    return NextResponse.json({ success: true, data: pending });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
