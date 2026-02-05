import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';

const AGENCY_TABLES: Record<string, string> = {
  cjia: 'cjia_daily_metrics',
  gwi: 'gwi_daily_metrics',
  gpl: 'gpl_daily_metrics',
  gcaa: 'gcaa_daily_metrics',
  'gpl-dbis': 'gpl_dbis_daily',
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ agency: string; id: string }> }) {
  try {
    const { agency, id } = await params;
    const user = await authenticateRequest(request);
    authorizeRoles(user, 'director', 'admin');

    const table = AGENCY_TABLES[agency?.toLowerCase()];
    if (!table) return NextResponse.json({ success: false, error: 'Invalid agency' }, { status: 400 });

    const { status } = await request.json();
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const result = await query(`UPDATE ${table} SET status = $1, approved_by = $2 WHERE id = $3 RETURNING *`, [status, user.id, id]);
    if (result.rows.length === 0) return NextResponse.json({ success: false, error: 'Metric not found' }, { status: 404 });

    await auditService.log({ userId: user.id, action: status === 'approved' ? 'APPROVE' : 'REJECT', entityType: table, entityId: id, newValues: { status }, request });
    return NextResponse.json({ success: true, message: `Metric ${status} successfully`, data: result.rows[0] });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
