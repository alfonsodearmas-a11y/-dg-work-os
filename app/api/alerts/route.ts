import { NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/db-pg';
import { requireRole } from '@/lib/auth-helpers';
import { getAgencyScope } from '@/lib/scoped-query';

export async function GET() {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;
    const { session } = authResult;

    const scope = getAgencyScope(session);

    let sql = `SELECT id, agency, severity, metric_name, current_value, threshold_value, message, is_active, created_at, acknowledged_at, acknowledged_by, resolved_at
       FROM alerts WHERE is_active = true AND resolved_at IS NULL`;
    const params: string[] = [];

    // Agency scoping: non-ministry users see only their agency's alerts
    if (scope) {
      sql += ` AND UPPER(agency) = UPPER($1)`;
      params.push(scope);
    }

    sql += ` ORDER BY severity DESC, created_at DESC LIMIT 50`;

    const result = await pgQuery(sql, params);
    return NextResponse.json({ success: true, data: result.rows });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch alerts' }, { status: 500 });
  }
}
