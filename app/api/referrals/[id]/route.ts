import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import {
  getReferralById,
  getReferralAuditLog,
  updateReferralFields,
  deleteDraftReferral,
  type ReferralPatch,
} from '@/lib/referrals/queries';
import { createNotification } from '@/lib/notifications/notification-service';
import { EmDashError } from '@/lib/referrals/em-dash-guard';
import { truncate } from '@/lib/format';
import { REFERRAL_STATUSES, type ReferralStatus } from '@/lib/referrals/types';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg', 'ps']);
  if (auth instanceof NextResponse) return auth;

  const referral = await getReferralById(id);
  if (!referral) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const audit = await getReferralAuditLog(id);
  return NextResponse.json({ referral, audit });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const before = await getReferralById(id);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: ReferralPatch = {};
  if (typeof body.delivery_method === 'string' || body.delivery_method === null) {
    patch.delivery_method = body.delivery_method as ReferralPatch['delivery_method'];
  }
  if (typeof body.delivered_to === 'string' || body.delivered_to === null) {
    patch.delivered_to = body.delivered_to as string | null;
  }
  if (typeof body.minister_direction === 'string' || body.minister_direction === null) {
    patch.minister_direction = body.minister_direction as string | null;
  }
  if (typeof body.closure_note === 'string' || body.closure_note === null) {
    patch.closure_note = body.closure_note as string | null;
  }
  if (typeof body.background === 'string') patch.background = body.background;
  if (typeof body.current_status === 'string') patch.current_status = body.current_status;
  if (typeof body.recommendation === 'string') patch.recommendation = body.recommendation;
  if (typeof body.requested_action === 'string') {
    patch.requested_action = body.requested_action as ReferralPatch['requested_action'];
  }
  if (typeof body.minister_notes === 'string' || body.minister_notes === null) {
    patch.minister_notes = body.minister_notes as string | null;
  }

  // Manual status override branch (DG-only, already enforced by requireRole).
  let manualStatusOverride: { target: ReferralStatus; reason: string } | undefined;
  if (typeof body.status === 'string') {
    if (!(REFERRAL_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (typeof body.manualOverrideReason !== 'string' || !body.manualOverrideReason.trim()) {
      return NextResponse.json(
        { error: 'manualOverrideReason is required when status is set' },
        { status: 400 },
      );
    }
    manualStatusOverride = {
      target: body.status as ReferralStatus,
      reason: body.manualOverrideReason,
    };
  }

  try {
    const updated = await updateReferralFields(id, patch, session.user.id, { manualStatusOverride });

    // Notify the DG (referrer) when the Minister direction is freshly logged.
    if (
      patch.minister_direction != null &&
      patch.minister_direction !== '' &&
      !before.minister_direction
    ) {
      try {
        await createNotification({
          recipientId: updated.referred_by,
          actorId: session.user.id,
          eventType: 'referral_direction_given',
          entityType: 'referral',
          entityId: updated.id,
          title: `Minister direction logged: ${updated.reference_number ?? 'pending'}`,
          body: truncate(patch.minister_direction, 80),
          referenceUrl: `/referrals/${updated.id}`,
        });
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, referralId: id }, 'Failed to send direction notification');
      }
    }

    return NextResponse.json({ referral: updated });
  } catch (err) {
    if (err instanceof EmDashError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logger.error({ err, id }, 'PATCH /api/referrals/[id] failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;
  try {
    await deleteDraftReferral(id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'NOT_DRAFT') {
      return NextResponse.json({ error: (err as Error).message }, { status: 409 });
    }
    logger.error({ err, id }, 'DELETE /api/referrals/[id] failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
