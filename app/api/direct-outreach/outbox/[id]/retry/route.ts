// OP Direct outbox — superadmin retry: failed|skipped → pending (the next
// bridge run picks the row up again; attempts/last_error kept as history).

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { getOutboxStatus, retryOutboxRow } from '@/lib/direct-outreach/outbox';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid outbox id' }, { status: 400 });
  }

  try {
    if (await retryOutboxRow(id)) return NextResponse.json({ ok: true });
    const current = await getOutboxStatus(id);
    if (!current) return NextResponse.json({ error: 'Outbox row not found' }, { status: 404 });
    return NextResponse.json({ error: `Row is ${current}, not failed/skipped` }, { status: 409 });
  } catch (err) {
    logger.error({ err, id }, '[direct-outreach] outbox retry failed');
    return NextResponse.json({ error: 'Failed to update outbox row' }, { status: 500 });
  }
}
