import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query as pgQuery } from '@/lib/db-pg';
import { requireRole, canAccessAgency } from '@/lib/auth-helpers';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

const alertPatchSchema = z.object({
  action: z.enum(['acknowledge', 'resolve']),
});

export const PATCH = withErrorHandler(async (request: NextRequest, ctx?: unknown) => {
  const authResult = await requireRole(['dg', 'ps', 'agency_admin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  const userId = session.user.id;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const { data, error } = await parseBody(request, alertPatchSchema);
  if (error) return error;

  // Fetch alert to check agency access
  const alertResult = await pgQuery('SELECT agency FROM alerts WHERE id = $1', [id]);
  if (alertResult.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Alert not found' }, { status: 404 });
  }
  const alertAgency = alertResult.rows[0].agency;
  if (alertAgency && !canAccessAgency(session.user.role, session.user.agency, alertAgency)) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
  }

  let result;
  if (data!.action === 'resolve') {
    result = await pgQuery(
      'UPDATE alerts SET resolved_at = NOW(), resolved_by = $1, is_active = false WHERE id = $2 RETURNING *',
      [userId, id]
    );
  } else {
    result = await pgQuery(
      'UPDATE alerts SET acknowledged_at = NOW(), acknowledged_by = $1 WHERE id = $2 RETURNING *',
      [userId, id]
    );
  }

  return NextResponse.json({ success: true, data: result.rows[0] });
});
