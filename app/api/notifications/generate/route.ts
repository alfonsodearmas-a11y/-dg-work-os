import { NextRequest, NextResponse } from 'next/server';
import { getPreferences, generateMeetingNotifications, generateTaskNotifications, generateMinutesReadyNotifications } from '@/lib/notifications';
import { sendPushForNotifications } from '@/lib/push';
import type { Notification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = 'dg';
    const prefs = await getPreferences(userId);

    const results = { meetings: 0, tasks: 0, minutes: 0, pushSent: 0 };
    const allCreated: Notification[] = [];

    // Generate notifications respecting preferences
    if (prefs.meeting_reminder_24h || prefs.meeting_reminder_1h || prefs.meeting_reminder_15m) {
      const r = await generateMeetingNotifications(userId);
      results.meetings = r.count;
      allCreated.push(...r.notifications);
    }

    if (prefs.task_due_reminders || prefs.task_overdue_alerts) {
      const r = await generateTaskNotifications(userId);
      results.tasks = r.count;
      allCreated.push(...r.notifications);
    }

    if (prefs.meeting_minutes_ready) {
      const r = await generateMinutesReadyNotifications(userId);
      results.minutes = r.count;
      allCreated.push(...r.notifications);
    }

    // Send push notifications for newly created notifications whose scheduled_for <= now
    const now = new Date();
    const pushable = allCreated.filter(n => new Date(n.scheduled_for) <= now);
    if (pushable.length > 0) {
      results.pushSent = await sendPushForNotifications(pushable);
    }

    return NextResponse.json({ generated: results });
  } catch (err) {
    console.error('POST /api/notifications/generate error:', err);
    return NextResponse.json({ error: 'Failed to generate notifications' }, { status: 500 });
  }
}
