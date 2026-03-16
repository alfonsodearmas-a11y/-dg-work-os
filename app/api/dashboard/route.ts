import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';
import { requireRole } from '@/lib/auth-helpers';
import { getViewAsAgencyScope } from '@/lib/scoped-query';
import { logger } from '@/lib/logger';

// Safe query that returns empty rows on table-not-found or connection errors
async function safeQuery(sql: string, params?: unknown[]) {
  try {
    return await query(sql, params);
  } catch {
    return { rows: [] };
  }
}

// Map agency code → the metric tables they're allowed to see
const AGENCY_METRIC_MAP: Record<string, string[]> = {
  gpl: ['gpl', 'gpl_dbis'],
  gwi: ['gwi'],
  cjia: ['cjia'],
  gcaa: ['gcaa'],
};

export async function GET(request: Request) {
  const result = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  try {
    const { searchParams } = new URL(request.url);
    const viewAsRole = session.user.role === 'dg' ? searchParams.get('viewAsRole') : null;
    const viewAsAgency = session.user.role === 'dg' ? searchParams.get('viewAsAgency') : null;
    const scope = getViewAsAgencyScope(session, viewAsRole, viewAsAgency);
    const allowedAgencies = scope
      ? AGENCY_METRIC_MAP[scope.toLowerCase()] || []
      : ['cjia', 'gwi', 'gpl', 'gpl_dbis', 'gcaa']; // ministry sees all

    const [cjia, gwi, gpl, gplDbis, gcaa, alerts] = await Promise.all([
      allowedAgencies.includes('cjia')
        ? safeQuery("SELECT * FROM cjia_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1")
        : { rows: [] },
      allowedAgencies.includes('gwi')
        ? safeQuery("SELECT * FROM gwi_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1")
        : { rows: [] },
      allowedAgencies.includes('gpl')
        ? safeQuery("SELECT * FROM gpl_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1")
        : { rows: [] },
      allowedAgencies.includes('gpl_dbis')
        ? safeQuery("SELECT * FROM gpl_dbis_daily WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1")
        : { rows: [] },
      allowedAgencies.includes('gcaa')
        ? safeQuery("SELECT * FROM gcaa_daily_metrics WHERE status = 'approved' ORDER BY report_date DESC LIMIT 1")
        : { rows: [] },
      scope
        ? safeQuery("SELECT * FROM alerts WHERE is_active = true AND resolved_at IS NULL AND UPPER(agency) = UPPER($1) ORDER BY severity DESC, created_at DESC LIMIT 10", [scope])
        : safeQuery("SELECT * FROM alerts WHERE is_active = true AND resolved_at IS NULL ORDER BY severity DESC, created_at DESC LIMIT 10"),
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
