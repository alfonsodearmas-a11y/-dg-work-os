import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { appendMinisterNote, getReferralById } from '@/lib/referrals/queries';
import { EmDashError } from '@/lib/referrals/em-dash-guard';
import { fmtGuyanaDateTime } from '@/lib/format';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireRole(['minister']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const referral = await getReferralById(id);
  if (!referral) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (referral.status === 'drafted') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const entry = `[${fmtGuyanaDateTime(new Date().toISOString())}] ${body.text.trim()}`;

  try {
    const updated = await appendMinisterNote(id, entry, session.user.id);
    return NextResponse.json({ referral: updated });
  } catch (err) {
    if (err instanceof EmDashError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    logger.error({ err, id }, 'POST /api/referrals/[id]/note failed');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
