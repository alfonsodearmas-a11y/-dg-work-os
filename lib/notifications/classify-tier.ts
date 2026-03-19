export type ImportanceTier = 'critical' | 'important' | 'informational';

export type NotificationEventType =
  | 'comment_mention'
  | 'task_assigned'
  | 'task_status_change'
  | 'task_blocked'
  | 'task_due_soon'
  | 'comment_reply'
  | 'task_completed'
  | 'subtask_completed';

export interface TierContext {
  taskPriority?: string;   // 'low' | 'medium' | 'high' | 'critical'
  taskStatus?: string;     // 'new' | 'active' | 'blocked' | 'done'
  isOverdue?: boolean;
  hoursUntilDue?: number;
  assigneeRole?: string;   // 'dg' | 'minister' | 'ps' | 'agency_admin' | 'officer'
}

const SENIOR_ROLES = new Set(['dg', 'minister', 'ps']);
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
  }
}
