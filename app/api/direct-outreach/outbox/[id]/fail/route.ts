// OP Direct outbox — bridge failure report: pending → failed, attempts++,
// last_error recorded. BRIDGE_TOKEN or superadmin.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { failOutboxRow, getOutboxStatus, isBridgeAuthorized } from '@/lib/direct-outreach/outbox';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failSchema = z.object({
  last_error: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isBridgeAuthorized(request)) {
    const authResult = await requireRole(['superadmin']);
    if (authResult instanceof NextResponse) return authResult;
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid outbox id' }, { status: 400 });
  }

  const parsed = failSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    if (await failOutboxRow(id, parsed.data.last_error)) {
      return NextResponse.json({ ok: true });
    }
    const current = await getOutboxStatus(id);
    if (!current) return NextResponse.json({ error: 'Outbox row not found' }, { status: 404 });
    return NextResponse.json({ error: `Row is ${current}, not pending` }, { status: 409 });
  } catch (err) {
    logger.error({ err, id }, '[direct-outreach] outbox fail-report failed');
    return NextResponse.json({ error: 'Failed to update outbox row' }, { status: 500 });
  }
}
