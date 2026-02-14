import { NextRequest, NextResponse } from 'next/server';
import { generateAll } from '@/lib/notifications';
import { sendPushForNotifications } from '@/lib/push';

export async function POST(request: NextRequest) {
  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = 'dg';
    const result = await generateAll(userId);

    // Send push notifications for newly created notifications whose scheduled_for <= now
    let pushSent = 0;
    const now = new Date();
    const pushable = result.allNotifications.filter(n => new Date(n.scheduled_for) <= now);
    if (pushable.length > 0) {
      pushSent = await sendPushForNotifications(pushable);
    }

    return NextResponse.json({
      generated: {
        meetings: result.meetings,
        tasks: result.tasks,
        minutes: result.minutes,
        projects: result.projects,
        kpi: result.kpi,
        oversight: result.oversight,
        taskBridge: result.taskBridge,
        total: result.allNotifications.length,
        pushSent,
      },
    });
  } catch (err) {
    console.error('POST /api/notifications/generate error:', err);
    return NextResponse.json({ error: 'Failed to generate notifications' }, { status: 500 });
  }
}
