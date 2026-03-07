import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { generateAll } from '@/lib/notifications';
import { sendPushForNotifications } from '@/lib/push';

// Vercel crons use GET
export { handleGenerate as GET };

async function handleGenerate(request: NextRequest) {
  // Auth: either cron secret OR authenticated session
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const session = await auth();

  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAuthenticated = !!session?.user?.id;

  if (!isCron && !isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // For cron: generate for ALL active users; for session: just the current user
    let userIds: string[];

    if (isCron) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('is_active', true);
      userIds = (users || []).map(u => u.id);
    } else {
      userIds = [session!.user.id];
    }

    let totalGenerated = 0;
    let totalPushSent = 0;

    for (const userId of userIds) {
      const result = await generateAll(userId);
      totalGenerated += result.allNotifications.length;

      const now = new Date();
      const pushable = result.allNotifications.filter(n => new Date(n.scheduled_for) <= now);
      if (pushable.length > 0) {
        totalPushSent += await sendPushForNotifications(pushable);
      }
    }

    return NextResponse.json({
      generated: {
        users: userIds.length,
        total: totalGenerated,
        pushSent: totalPushSent,
      },
    });
  } catch (err) {
    console.error('POST /api/notifications/generate error:', err);
    return NextResponse.json({ error: 'Failed to generate notifications' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleGenerate(request);
}
