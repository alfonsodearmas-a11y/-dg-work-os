// OP Direct outbox — bridge acknowledgement: pending → posted, recording OP
// Direct's per-comment id (history case_detail_id). BRIDGE_TOKEN or superadmin.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ackOutboxRows } from '@/lib/direct-outreach/outbox';
import { requireBridgeOrSuperadmin } from '@/lib/direct-outreach/outbox-auth';
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
  const denied = await requireBridgeOrSuperadmin(request);
  if (denied) return denied;

  const parsed = ackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // One set-based statement regardless of batch size; rows not currently
    // pending simply don't count (the caller compares acked vs sent).
    const acked = await ackOutboxRows(parsed.data);
    return NextResponse.json({ acked });
  } catch (err) {
    logger.error({ err }, '[direct-outreach] outbox ack failed');
    return NextResponse.json({ error: 'Failed to ack outbox rows' }, { status: 500 });
  }
}
