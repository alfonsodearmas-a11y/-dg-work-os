import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';

// Safe query that returns empty rows on table-not-found or connection errors
async function safeQuery(sql: string) {
  try {
    return await query(sql);
  } catch {
    return { rows: [] };
  }
}

export async function GET() {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;

  try {
    const [cjia, gwi, gpl, gplDbis, gcaa, alerts] = await Promise.all([
      safeQuery("SELECT * FROM cjia_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1"),
      safeQuery("SELECT * FROM gwi_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1"),
      safeQuery("SELECT * FROM gpl_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1"),
      safeQuery("SELECT * FROM gpl_dbis_daily WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1"),
      safeQuery("SELECT * FROM gcaa_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1"),
      safeQuery("SELECT * FROM alerts WHERE is_active = true AND resolved_at IS NULL ORDER BY severity DESC, created_at DESC LIMIT 10"),
    ]);

    let gplData = gpl.rows[0] || null;
    const dbisData = gplDbis.rows[0] || null;
    if (dbisData) gplData = { ...gplData, dbis: dbisData };

    return NextResponse.json({
      success: true,
      data: { cjia: cjia.rows[0] || null, gwi: gwi.rows[0] || null, gpl: gplData, gcaa: gcaa.rows[0] || null, alerts: alerts.rows },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Dashboard data load failed');
    return NextResponse.json({ success: false, error: 'Failed to load dashboard' }, { status: 500 });
  }
}
