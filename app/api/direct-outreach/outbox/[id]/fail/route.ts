// OP Direct outbox — bridge failure report: pending → failed, attempts++,
// last_error recorded. BRIDGE_TOKEN or superadmin.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OUTBOX_ID_RE, failOutboxRow } from '@/lib/direct-outreach/outbox';
import { requireBridgeOrSuperadmin } from '@/lib/direct-outreach/outbox-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const failSchema = z.object({
  last_error: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireBridgeOrSuperadmin(request);
  if (denied) return denied;

  const { id } = await params;
  if (!OUTBOX_ID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid outbox id' }, { status: 400 });
  }

  const parsed = failSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await failOutboxRow(id, parsed.data.last_error);
    if (result.applied) return NextResponse.json({ ok: true });
    if (result.current === null) {
      return NextResponse.json({ error: 'Outbox row not found' }, { status: 404 });
    }
    return NextResponse.json({ error: `Row is ${result.current}, not pending` }, { status: 409 });
  } catch (err) {
    logger.error({ err, id }, '[direct-outreach] outbox fail-report failed');
    return NextResponse.json({ error: 'Failed to update outbox row' }, { status: 500 });
  }
}
