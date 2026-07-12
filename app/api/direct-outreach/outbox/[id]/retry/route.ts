// OP Direct outbox — superadmin retry: failed|skipped → pending (the next
// bridge run picks the row up again; attempts/last_error kept as history).

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { OUTBOX_ID_RE, retryOutboxRow } from '@/lib/direct-outreach/outbox';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  if (!OUTBOX_ID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid outbox id' }, { status: 400 });
  }

  try {
    const result = await retryOutboxRow(id);
    if (result.applied) return NextResponse.json({ ok: true });
    if (result.current === null) {
      return NextResponse.json({ error: 'Outbox row not found' }, { status: 404 });
    }
    return NextResponse.json({ error: `Row is ${result.current}, not failed/skipped` }, { status: 409 });
  } catch (err) {
    logger.error({ err, id }, '[direct-outreach] outbox retry failed');
    return NextResponse.json({ error: 'Failed to update outbox row' }, { status: 500 });
  }
}
