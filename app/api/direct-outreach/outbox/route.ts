// OP Direct outbox — superadmin UI listing (counts + recent rows). The bridge
// never calls this; it uses /outbox/export (BRIDGE_TOKEN) instead.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { query } from '@/lib/db-pg';
import { OUTREACH_OUTBOX_STATUSES, type OutreachOutboxStatus } from '@/lib/direct-outreach/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 200;

export async function GET() {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const [countsResult, rowsResult] = await Promise.all([
      query(
        `SELECT status, count(*)::int AS n
           FROM direct_outreach_opdirect_outbox
          GROUP BY status`,
      ),
      query(
        `SELECT id, case_id, source_kind, dgos_ref, comment_text, op_status_target,
                author_label, status, opdirect_comment_id, attempts, last_error,
                posted_at, created_at
           FROM direct_outreach_opdirect_outbox
          ORDER BY created_at DESC
          LIMIT ${LIST_LIMIT}`,
      ),
    ]);

    const counts = Object.fromEntries(OUTREACH_OUTBOX_STATUSES.map((s) => [s, 0])) as Record<
      OutreachOutboxStatus,
      number
    >;
    for (const row of countsResult.rows as { status: OutreachOutboxStatus; n: number }[]) {
      counts[row.status] = row.n;
    }

    return NextResponse.json({ counts, rows: rowsResult.rows });
  } catch (err) {
    logger.error({ err }, '[direct-outreach] outbox list failed');
    return NextResponse.json({ error: 'Failed to load outbox' }, { status: 500 });
  }
}
