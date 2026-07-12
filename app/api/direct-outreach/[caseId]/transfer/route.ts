import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import {
  executeTransfer,
  getTransferNotificationRecipients,
} from '@/lib/direct-outreach/queries';
import { OUTREACH_AGENCIES } from '@/lib/direct-outreach/types';
import { createNotification } from '@/lib/notifications/notification-service';
import { truncate } from '@/lib/format';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const INT4_MAX = 2147483647;

const transferSchema = z.object({
  to_agency: z.enum(OUTREACH_AGENCIES as unknown as [string, ...string[]]),
  // Amendment A: a transfer must carry a reason — it lands in the audit row.
  reason: z
    .string()
    .trim()
    .min(1, 'Transfer reason is required')
    .max(500, 'Transfer reason must be 500 characters or fewer'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  // Transfers are a ministry-level action: superadmin only.
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { caseId } = await params;
  if (!/^\d+$/.test(caseId)) {
    return NextResponse.json({ error: 'Invalid case ID' }, { status: 400 });
  }
  const caseIdNum = Number(caseId);
  if (!Number.isSafeInteger(caseIdNum) || caseIdNum > INT4_MAX) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const parsed = transferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    );
  }
  const { to_agency, reason } = parsed.data;

  try {
    // Existence/no-op checks live INSIDE executeTransfer, under the case-row
    // lock, so concurrent transfers serialize and the audit chain stays true.
    const result = await executeTransfer({
      caseId: caseIdNum,
      toAgency: to_agency,
      reason,
      byUserId: session.user.id,
      byLabel: session.user.name || session.user.email || 'Unknown user',
    });

    if (!result.ok) {
      if (result.reason === 'not_found') {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: `Case is already with ${result.agency ?? to_agency}` },
        { status: 400 },
      );
    }
    const { fromAgency, clearedAssigneeUserId } = result;

    // Fire-and-forget fan-out to the receiving agency (actor dropped by
    // the service's self-suppression; each failure only logs).
    getTransferNotificationRecipients(to_agency)
      .then((recipients) =>
        Promise.all(
          recipients.map((r) =>
            createNotification({
              recipientId: r.id,
              actorId: session.user.id,
              eventType: 'outreach_transferred',
              entityType: 'outreach_case',
              entityId: String(caseIdNum),
              title: `Outreach case #${caseIdNum} transferred to ${to_agency}`,
              body: truncate(reason, 140),
              referenceUrl: `/direct-outreach?case=${caseIdNum}`,
            }).catch((err) =>
              logger.warn({ err, caseId: caseIdNum, recipient: r.id }, '[direct-outreach] transfer notification failed'),
            ),
          ),
        ),
      )
      .catch((err) => logger.warn({ err, caseId: caseIdNum }, '[direct-outreach] transfer notification fan-out failed'));

    return NextResponse.json({
      success: true,
      from_agency: fromAgency,
      to_agency,
      cleared_assignee_user_id: clearedAssigneeUserId,
    });
  } catch (err) {
    logger.error({ err, caseId }, '[direct-outreach] transfer failed');
    return NextResponse.json({ error: 'Failed to transfer case' }, { status: 500 });
  }
}
