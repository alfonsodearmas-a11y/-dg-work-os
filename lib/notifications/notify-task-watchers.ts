import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createNotification } from './notification-service';

interface NotifyPayload {
  taskTitle: string;
  body?: string;
  actorId?: string;
  /** Currently-assigned owner — never re-notified as a watcher. */
  currentAssigneeUserId?: string | null;
  referenceUrl?: string;
  parentEntityType?: string;
  parentEntityId?: string;
}

/**
 * Fan out a task event to every watcher in task_watchers, deduping the
 * current assignee so they never receive both a `task_assigned` and a
 * `task_watcher_notification` for the same event.
 *
 * `watcherUserIds` is an optional caller-supplied list — when the caller has
 * just inserted the watcher rows it already knows who they are, and skipping
 * the round-trip avoids a race with concurrent removals. Falls back to a
 * fresh query when omitted.
 *
 * Each createNotification call honors the recipient's
 * notification_preferences.event_preferences['task_watcher_notification']
 * (in_app + email) and the do_not_disturb flag — see notification-service.
 */
export async function notifyTaskWatchers(
  taskId: string,
  payload: NotifyPayload,
  opts: { watcherUserIds?: string[] } = {},
): Promise<{ notified: number; skipped: number; failed: number }> {
  let userIds = opts.watcherUserIds ?? null;
  if (!userIds) {
    const { data, error } = await supabaseAdmin
      .from('task_watchers')
      .select('user_id')
      .eq('task_id', taskId);
    if (error) {
      logger.error({ err: error, taskId }, 'notifyTaskWatchers: query failed');
      return { notified: 0, skipped: 0, failed: 0 };
    }
    userIds = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  }

  // Dedup the current assignee at send time (the spec calls for silent dedup;
  // see plan). Filter once so the final count reflects reality.
  const assignee = payload.currentAssigneeUserId ?? null;
  const targets = userIds.filter((id) => !!id && id !== assignee);
  const skipped = userIds.length - targets.length;

  if (targets.length === 0) {
    return { notified: 0, skipped, failed: 0 };
  }

  // Independent per-recipient round-trips run in parallel; one slow user does
  // not delay the rest, and per-call failures are isolated.
  const results = await Promise.allSettled(
    targets.map((userId) =>
      createNotification({
        recipientId: userId,
        actorId: payload.actorId,
        eventType: 'task_watcher_notification',
        entityType: 'task',
        entityId: taskId,
        parentEntityType: payload.parentEntityType,
        parentEntityId: payload.parentEntityId,
        title: `You're watching: ${payload.taskTitle}`,
        body: payload.body,
        referenceUrl: payload.referenceUrl ?? `/tasks?taskId=${taskId}`,
      }),
    ),
  );

  let notified = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') notified++;
    else {
      failed++;
      logger.error(
        { err: r.reason, taskId, userId: targets[i] },
        'notifyTaskWatchers: createNotification failed for watcher',
      );
    }
  }
  return { notified, skipped, failed };
}
