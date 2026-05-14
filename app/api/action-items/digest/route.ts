import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { buildDailyDigest, formatDigestBody } from '@/lib/action-items/digest';
import { insertNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export { handler as GET, handler as POST };

async function handler(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let isAuthed = isCron;
  if (!isAuthed) {
    const session = await auth();
    isAuthed = !!session?.user?.id && session.user.role === 'dg';
  }
  if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const summary = await buildDailyDigest();
  const body = formatDigestBody(summary);

  // Recipients: DG + ministry-level principals (Minister, PS, parl_sec). All four
  // are super admins / political principals per spec §0 #12 and receive the
  // digest push together. DailyDigestCard on /action-items/meetings is an
  // additional surface, not a substitute.
  const { data: recipients } = await supabaseAdmin
    .from('users').select('id')
    .in('role', ['dg', 'minister', 'ps', 'parl_sec'])
    .eq('is_active', true);

  const now = new Date().toISOString();
  let pushed = 0;
  for (const r of recipients ?? []) {
    try {
      await insertNotification({
        user_id: r.id as string,
        type: 'action_items_daily_digest',
        title: `Action Items — yesterday's pipeline`,
        body,
        icon: null,
        priority: 'low',
        reference_type: 'system',
        reference_id: null,
        reference_url: '/action-items/meetings',
        scheduled_for: now,
        category: 'system',
        source_module: 'action-items',
        action_required: false,
      });
      pushed++;
    } catch (err) {
      logger.error({ err, userId: r.id }, 'digest notification failed (non-fatal)');
    }
  }

  return NextResponse.json({ summary, pushed });
}
