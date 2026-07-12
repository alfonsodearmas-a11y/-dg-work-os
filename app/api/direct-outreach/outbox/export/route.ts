// OP Direct outbox — bridge export: every pending row, oldest first. Auth is
// the constant-time BRIDGE_TOKEN header (x-bridge-token) OR a superadmin
// session; middleware lists this path as public so the session-less bridge can
// reach the route-level check at all.

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';
import { requireBridgeOrSuperadmin } from '@/lib/direct-outreach/outbox-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireBridgeOrSuperadmin(request);
  if (denied) return denied;

  try {
    const result = await query(
      `SELECT id, case_id, dgos_ref, comment_text, op_status_target, author_label
         FROM direct_outreach_opdirect_outbox
        WHERE status = 'pending'
        ORDER BY created_at ASC`,
    );
    return NextResponse.json({ pending: result.rows });
  } catch (err) {
    logger.error({ err }, '[direct-outreach] outbox export failed');
    return NextResponse.json({ error: 'Failed to export outbox' }, { status: 500 });
  }
}
