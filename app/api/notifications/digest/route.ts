import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  renderDigestEmail,
  type EmailNotification,
} from '@/lib/notifications/email-templates';
import { entityUrl, isCronAuthorized } from '@/lib/notifications/email-utils';
import { logger } from '@/lib/logger';

interface NotifRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  title: string;
  body: string | null;
  event_type: string | null;
  importance_tier: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reference_url: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// POST /api/notifications/digest
// Sends daily digest emails to users with digest-eligible notifications.
// ---------------------------------------------------------------------------

// Vercel crons use GET — export the same handler for both methods
export { handleDigest as GET };

export async function POST(request: NextRequest) {
  return handleDigest(request);
}

async function handleDigest(request: NextRequest) {
  try {
    // Auth: cron secret OR DG role
    if (!isCronAuthorized(request)) {
      const authResult = await requireRole(['superadmin']);
      if (authResult instanceof NextResponse) return authResult;
    }

    // Synthesize task_daily_reminder rows for assignees + watchers of open
    // tasks before the fetch below so they land in this digest batch.
    // Idempotent — re-runs on the same UTC day insert zero rows.
    const synthSummary = await synthesizeTaskDailyReminders();
    logger.info(synthSummary, 'digest: synthesized task_daily_reminder rows');


    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, actor_id, title, body, event_type, importance_tier, entity_type, entity_id, reference_url, created_at')
      .eq('digest_eligible', true)
      .is('email_sent_at', null)
      .order('user_id')
      .order('created_at');

    if (fetchError) {
      logger.error({ err: fetchError }, 'digest: failed to fetch eligible notifications');
      return NextResponse.json({ error: 'Failed to fetch digest notifications' }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, recipients: 0, notifications: 0 });
    }

    // Group notifications by user_id and collect all user IDs in one pass
    const groupedByUser = new Map<string, NotifRow[]>();
    const allUserIds = new Set<string>();
    for (const row of rows as NotifRow[]) {
      const group = groupedByUser.get(row.user_id);
      if (group) { group.push(row); } else { groupedByUser.set(row.user_id, [row]); }
      allUserIds.add(row.user_id);
      if (row.actor_id) allUserIds.add(row.actor_id);
    }

    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', Array.from(allUserIds));

    if (usersError) {
      logger.error({ err: usersError }, 'digest: failed to fetch users');
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    const userMap = new Map<string, { name: string; email: string }>();
    for (const u of users || []) {
      userMap.set(u.id, { name: u.name, email: u.email });
    }

    const recipientIds = Array.from(groupedByUser.keys());
    const { data: prefsRows, error: prefsError } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, digest_frequency, digest_time, event_preferences')
      .in('user_id', recipientIds);

    if (prefsError) {
      logger.error({ err: prefsError }, 'digest: failed to fetch preferences');
      // Continue with defaults — don't block sending
    }

    const prefsMap = new Map<string, { digest_frequency: string; digest_time: string; event_preferences: Record<string, unknown> }>();
    for (const p of prefsRows || []) {
      prefsMap.set(p.user_id, {
        digest_frequency: p.digest_frequency || 'daily',
        digest_time: p.digest_time || '07:00',
        event_preferences: (p.event_preferences as Record<string, unknown>) || {},
      });
    }

    // 5. Send each recipient digest in parallel — capped concurrency keeps
    //    the SMTP transport from getting hammered while still cutting the
    //    O(N) wall-clock down to roughly O(N / concurrency).
    const CONCURRENCY = 5;
    let recipientsSent = 0;
    let totalNotificationsSent = 0;

    async function sendOne(userId: string, notifs: NotifRow[]): Promise<void> {
      try {
        const prefs = prefsMap.get(userId);
        if (prefs?.digest_frequency === 'off') {
          logger.info({ userId }, 'digest: user has digest turned off, skipping');
          return;
        }

        const recipient = userMap.get(userId);
        if (!recipient?.email) {
          logger.warn({ userId }, 'digest: no email for recipient, skipping');
          return;
        }

        const emailNotifs: EmailNotification[] = notifs.map((n) => {
          const actor = n.actor_id ? userMap.get(n.actor_id) : undefined;
          return {
            title: n.title,
            body: n.body || undefined,
            event_type: n.event_type || 'general',
            importance_tier: (['critical', 'important', 'informational'].includes(n.importance_tier as string) ? n.importance_tier : 'informational') as EmailNotification['importance_tier'],
            actor_name: actor?.name || undefined,
            entity_type: n.entity_type || 'system',
            entity_url: entityUrl(n),
            created_at: n.created_at,
          };
        });

        const firstName = recipient.name?.split(' ')[0] || recipient.name || 'there';
        const rendered = renderDigestEmail(emailNotifs, firstName);

        const result = await sendEmail({
          to: recipient.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });

        if (result.success) {
          const notifIds = notifs.map((n) => n.id);
          const { error: updateError } = await supabaseAdmin
            .from('notifications')
            .update({ email_sent_at: new Date().toISOString() })
            .in('id', notifIds);

          if (updateError) {
            logger.error({ err: updateError, userId, count: notifIds.length }, 'digest: sent but failed to update email_sent_at');
          }

          recipientsSent++;
          totalNotificationsSent += notifs.length;
        } else {
          logger.error({ userId, error: result.error }, 'digest: sendEmail failed for recipient');
        }
      } catch (err) {
        logger.error({ err, userId }, 'digest: unexpected error processing recipient');
      }
    }

    const queue = Array.from(groupedByUser.entries());
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < queue.length) {
        const idx = cursor++;
        const [userId, notifs] = queue[idx];
        await sendOne(userId, notifs);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
    );

    logger.info({ recipientsSent, totalNotificationsSent }, 'digest: batch complete');
    return NextResponse.json({
      success: true,
      recipients: recipientsSent,
      notifications: totalNotificationsSent,
    });
  } catch (err) {
    logger.error({ err }, 'digest: unhandled error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Synthesize task_daily_reminder rows for assignees + watchers of open tasks.
//
// "Open" = status IN (new, active, blocked). Rows that match three urgency
// buckets (overdue, due today, due this week) become digest-eligible
// notifications with importance_tier mapped accordingly. Tasks with no
// due_date are included as informational so they don't drop off the radar.
//
// Idempotency: a daily reminder for the same (user_id, task_id, UTC date)
// is inserted only if one doesn't already exist. Cron re-runs in the same
// day insert zero rows.
// ---------------------------------------------------------------------------
interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  owner_user_id: string | null;
  agency: string | null;
  priority: string | null;
}

interface WatcherJoin {
  user_id: string;
  task_id: string;
}

async function synthesizeTaskDailyReminders(): Promise<{
  candidates: number;
  inserted: number;
  skipped_existing: number;
}> {
  // Open tasks within "this week" or with no due_date.
  const todayStr = new Date().toISOString().slice(0, 10);
  const inSevenDays = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: tasks, error: tasksErr } = await supabaseAdmin
    .from('tasks')
    .select('id, title, due_date, owner_user_id, agency, priority')
    .in('status', ['new', 'active', 'blocked'])
    .or(`due_date.is.null,due_date.lte.${inSevenDays}`);

  if (tasksErr) {
    logger.error({ err: tasksErr }, 'digest synth: tasks query failed');
    return { candidates: 0, inserted: 0, skipped_existing: 0 };
  }

  const taskRows = (tasks ?? []) as TaskRow[];
  if (taskRows.length === 0) {
    return { candidates: 0, inserted: 0, skipped_existing: 0 };
  }

  const taskById = new Map<string, TaskRow>(taskRows.map((t) => [t.id, t]));
  const taskIds = taskRows.map((t) => t.id);

  const { data: watcherRows, error: watcherErr } = await supabaseAdmin
    .from('task_watchers')
    .select('user_id, task_id')
    .in('task_id', taskIds);

  if (watcherErr) {
    logger.error({ err: watcherErr }, 'digest synth: watchers query failed');
  }

  // Deduped (user_id, task_id) pairs across owners and watchers.
  const pairKey = (uid: string, tid: string) => `${uid}::${tid}`;
  const pairs = new Map<string, { user_id: string; task: TaskRow }>();
  for (const t of taskRows) {
    if (t.owner_user_id) {
      pairs.set(pairKey(t.owner_user_id, t.id), { user_id: t.owner_user_id, task: t });
    }
  }
  for (const w of (watcherRows ?? []) as WatcherJoin[]) {
    const t = taskById.get(w.task_id);
    if (t) pairs.set(pairKey(w.user_id, w.task_id), { user_id: w.user_id, task: t });
  }

  if (pairs.size === 0) {
    return { candidates: 0, inserted: 0, skipped_existing: 0 };
  }

  // Skip pairs that already have a row created today — idempotency check
  // against created_at >= start of UTC day.
  const startOfDay = `${todayStr}T00:00:00.000Z`;
  const userIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.user_id)));
  const { data: existing } = await supabaseAdmin
    .from('notifications')
    .select('user_id, entity_id')
    .eq('event_type', 'task_daily_reminder')
    .eq('entity_type', 'task')
    .gte('created_at', startOfDay)
    .in('user_id', userIds)
    .in('entity_id', taskIds);

  const seen = new Set<string>();
  for (const e of (existing ?? []) as Array<{ user_id: string; entity_id: string }>) {
    seen.add(pairKey(e.user_id, e.entity_id));
  }

  const inserts: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  let skippedExisting = 0;

  for (const [key, pair] of pairs) {
    if (seen.has(key)) {
      skippedExisting++;
      continue;
    }
    const { task } = pair;
    const due = task.due_date;
    let importance: 'critical' | 'important' | 'informational';
    let body: string;
    if (due && due < todayStr) {
      const daysOverdue = Math.max(
        1,
        Math.floor(
          (new Date(`${todayStr}T00:00:00Z`).getTime() -
            new Date(`${due}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      );
      importance = 'critical';
      body = `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}${task.agency ? ` · ${task.agency}` : ''}`;
    } else if (due === todayStr) {
      importance = 'important';
      body = `Due today${task.agency ? ` · ${task.agency}` : ''}`;
    } else if (due) {
      importance = 'informational';
      body = `Due ${due}${task.agency ? ` · ${task.agency}` : ''}`;
    } else {
      importance = 'informational';
      body = `Open${task.agency ? ` · ${task.agency}` : ''}`;
    }

    inserts.push({
      user_id: pair.user_id,
      type: 'task_daily_reminder',
      event_type: 'task_daily_reminder',
      importance_tier: importance,
      title: task.title,
      body,
      icon: 'task',
      priority: importance === 'critical' ? 'urgent' : importance === 'important' ? 'high' : 'medium',
      reference_type: 'task',
      reference_id: task.id,
      reference_url: `/tasks?taskId=${task.id}`,
      entity_type: 'task',
      entity_id: task.id,
      scheduled_for: now,
      category: 'tasks',
      source_module: 'digest-synth',
      action_required: importance !== 'informational',
      action_type: importance !== 'informational' ? 'acknowledge' : null,
      digest_eligible: true,
      created_at: now,
    });
  }

  if (inserts.length === 0) {
    return { candidates: pairs.size, inserted: 0, skipped_existing: skippedExisting };
  }

  // 6. Bulk insert (Supabase chunks internally if needed). The row count is
  //    deterministic from `inserts.length` — no need to ask Postgres for an
  //    exact count, which adds a round trip + RLS recheck.
  const { error: insertErr } = await supabaseAdmin.from('notifications').insert(inserts);

  if (insertErr) {
    logger.error(
      { err: insertErr, attempted: inserts.length },
      'digest synth: bulk insert failed',
    );
    return { candidates: pairs.size, inserted: 0, skipped_existing: skippedExisting };
  }

  return {
    candidates: pairs.size,
    inserted: inserts.length,
    skipped_existing: skippedExisting,
  };
}
