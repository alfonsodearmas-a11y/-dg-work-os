// OP Direct outbox — bridge acknowledgement: pending → posted, recording OP
// Direct's per-comment id (history case_detail_id). BRIDGE_TOKEN or superadmin.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { ackOutboxRow, isBridgeAuthorized } from '@/lib/direct-outreach/outbox';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ackSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      opdirect_comment_id: z.string().trim().max(200).nullable().optional(),
    }),
  )
  .min(1)
  .max(500);

export async function POST(request: NextRequest) {
  if (!isBridgeAuthorized(request)) {
    const authResult = await requireRole(['superadmin']);
    if (authResult instanceof NextResponse) return authResult;
  }

  const parsed = ackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    let acked = 0;
    for (const item of parsed.data) {
      if (await ackOutboxRow(item.id, item.opdirect_comment_id ?? null)) acked += 1;
    }
    return NextResponse.json({ acked });
  } catch (err) {
    logger.error({ err }, '[direct-outreach] outbox ack failed');
    return NextResponse.json({ error: 'Failed to ack outbox rows' }, { status: 500 });
  }
}
