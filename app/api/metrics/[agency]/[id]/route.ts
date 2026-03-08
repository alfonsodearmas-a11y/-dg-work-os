import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const AGENCY_TABLES: Record<string, string> = {
  cjia: 'cjia_daily_metrics',
  gwi: 'gwi_daily_metrics',
  gpl: 'gpl_daily_metrics',
  gcaa: 'gcaa_daily_metrics',
  'gpl-dbis': 'gpl_dbis_daily',
};

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const PATCH = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  const session = await auth();
  const userId = session?.user?.id || 'system';
  const { agency, id } = await (ctx as { params: Promise<{ agency: string; id: string }> }).params;

  const table = AGENCY_TABLES[agency?.toLowerCase()];
  if (!table) return NextResponse.json({ success: false, error: 'Invalid agency' }, { status: 400 });

  const { data, error } = await parseBody(request, patchSchema);
  if (error) return error;

  const result = await query(`UPDATE ${table} SET status = $1, approved_by = $2 WHERE id = $3 RETURNING *`, [data!.status, userId, id]);
  if (result.rows.length === 0) return NextResponse.json({ success: false, error: 'Metric not found' }, { status: 404 });

  await auditService.log({ userId, action: data!.status === 'approved' ? 'APPROVE' : 'REJECT', entityType: table, entityId: id, newValues: { status: data!.status }, request });
  return NextResponse.json({ success: true, message: `Metric ${data!.status} successfully`, data: result.rows[0] });
});
