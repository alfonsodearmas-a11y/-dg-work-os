import { MINISTRY_ROLES } from '@/lib/people-types';

export type ImportanceTier = 'critical' | 'important' | 'informational';

export type NotificationEventType =
  | 'comment_mention'
  | 'task_assigned'
  | 'task_status_change'
  | 'task_blocked'
  | 'task_due_soon'
  | 'comment_reply'
  | 'task_completed'
  | 'subtask_completed'
  | 'task_watcher_notification'
  | 'task_daily_reminder'
  | 'task_agency_head_notice'
  | 'referral_direction_given';

export interface TierContext {
  taskPriority?: string;   // 'low' | 'medium' | 'high' | 'critical'
  taskStatus?: string;     // 'new' | 'active' | 'blocked' | 'done'
  isOverdue?: boolean;
  hoursUntilDue?: number;
  assigneeRole?: string;   // 'dg' | 'minister' | 'ps' | 'agency_admin' | 'officer'
}

const SENIOR_ROLES = new Set(MINISTRY_ROLES);
const HIGH_PRIORITIES = new Set(['high', 'critical']);

/**
 * Classifies a notification event into an importance tier.
 *
 * Pure function — no side effects, no database access.
 * The caller is responsible for resolving contextual fields
 * (taskPriority, taskStatus, isOverdue, hoursUntilDue, assigneeRole)
 * before invoking this function.
 */
export function classifyNotificationTier(
  eventType: NotificationEventType,
  context: TierContext = {},
): ImportanceTier {
  const { taskPriority, taskStatus, isOverdue, hoursUntilDue, assigneeRole } =
    context;

  const effectivelyOverdue =
    isOverdue === true ||
    (hoursUntilDue !== undefined && hoursUntilDue <= 0);

  switch (eventType) {
    // ── Always critical ──────────────────────────────────────────────
    case 'task_blocked':
      return 'critical';

    // ── Important by default, escalates to critical ──────────────────
    case 'comment_mention':
      if (taskStatus === 'blocked' || effectivelyOverdue) return 'critical';
      return 'important';

    case 'task_assigned':
      if (
        (taskPriority && HIGH_PRIORITIES.has(taskPriority)) ||
        effectivelyOverdue
      )
        return 'critical';
      return 'important';

    // ── Important by default, never escalates ────────────────────────
    case 'comment_reply':
      return 'important';

    // ── Informational by default, conditional escalation ─────────────
    case 'task_due_soon':
      if (effectivelyOverdue) return 'critical';
      if (hoursUntilDue !== undefined && hoursUntilDue <= 24) return 'important';
      return 'informational';

    case 'task_completed':
      if (assigneeRole && SENIOR_ROLES.has(assigneeRole)) return 'important';
      return 'informational';

    // ── Informational, never escalates ───────────────────────────────
    case 'task_status_change':
    case 'subtask_completed':
      return 'informational';

    // ── Watcher fan-out: mirror task_assigned tier shape ─────────────
    case 'task_watcher_notification':
      if (
        (taskPriority && HIGH_PRIORITIES.has(taskPriority)) ||
        effectivelyOverdue
      )
        return 'critical';
      return 'important';

    // ── Daily digest synthesis: tier reflects urgency, set by caller
    //     via the SQL CASE on due_date. Anything missing falls back
    //     to informational so the digest still groups it cleanly.
    case 'task_daily_reminder':
      if (effectivelyOverdue) return 'critical';
      if (hoursUntilDue !== undefined && hoursUntilDue <= 24) return 'important';
      return 'informational';

    // ── Agency-head-of-agency notice: always important ───────────────
    case 'task_agency_head_notice':
      return 'important';

    // ── Minister direction logged on a referral: always important ────
    case 'referral_direction_given':
      return 'important';
  }
}
