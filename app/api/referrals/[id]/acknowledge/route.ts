import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { getReferralById, updateReferralFields } from '@/lib/referrals/queries';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['minister']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const referral = await getReferralById(id);
  if (!referral) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (referral.status === 'drafted') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (referral.minister_acknowledged_at) {
    return NextResponse.json({ referral }); // idempotent
  }

  try {
    const updated = await updateReferralFields(
      id,
      { minister_acknowledged_at: new Date().toISOString() },
      session.user.id,
    );
    return NextResponse.json({ referral: updated });
  } catch (err) {
    logger.error({ err, id }, 'POST /api/referrals/[id]/acknowledge failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
