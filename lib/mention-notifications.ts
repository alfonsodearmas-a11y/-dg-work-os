import { query } from './db-pg';
import { insertNotification } from './notifications';
import { logger } from '@/lib/logger';

/**
 * Store mention records and create notifications for mentioned users.
 *
 * Inserts into task_comment_mentions (if the table exists) and creates
 * in-app notifications for each mentioned user.
 */
export async function notifyMentionedUsers(
  commentId: string,
  taskId: string,
  mentionedUserIds: string[],
  commentAuthorId: string
): Promise<void> {
  // Fetch task title for the notification message
  let taskTitle = 'a task';
  try {
    const taskResult = await query('SELECT title FROM tasks WHERE id = $1', [taskId]);
    if (taskResult.rows[0]?.title) {
      taskTitle = taskResult.rows[0].title;
    }
  } catch {
    // non-critical
  }

  // Fetch commenter name
  let commenterName = 'Someone';
  try {
    const userResult = await query('SELECT full_name FROM users WHERE id = $1', [commentAuthorId]);
    if (userResult.rows[0]?.full_name) {
      commenterName = userResult.rows[0].full_name;
    }
  } catch {
    // non-critical
  }

  for (const userId of mentionedUserIds) {
    // Skip self-mentions
    if (userId === commentAuthorId) continue;

    // Insert into task_comment_mentions table (best-effort)
    try {
      await query(
        `INSERT INTO task_comment_mentions (comment_id, mentioned_user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [commentId, userId]
      );
    } catch (err) {
      // Table may not exist yet — log and continue
      console.warn('[mention-notifications] Could not insert mention record:', (err as Error).message);
    }

    // Create in-app notification via the existing notifications system
    try {
      await insertNotification({
        user_id: userId,
        type: 'mention_in_comment',
        title: `${commenterName} mentioned you`,
        body: `In a comment on: ${taskTitle}`,
        icon: 'at-sign',
        priority: 'medium',
        reference_type: 'task',
        reference_id: taskId,
        reference_url: '/admin/tasks',
        scheduled_for: new Date().toISOString(),
        category: 'tasks',
        source_module: 'tasks',
      });
    } catch (err) {
      logger.error({ err: err as Error }, 'mention-notifications: failed to create notification');
    }
  }
}
