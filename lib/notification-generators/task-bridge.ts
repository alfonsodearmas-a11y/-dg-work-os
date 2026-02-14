import { insertNotification } from '../notifications';
import type { Notification, GenerateResult } from '../notifications';
import { query } from '../db-pg';

const BRIDGE_TYPES: Record<string, { notifType: string; priority: 'low' | 'medium' | 'high' | 'urgent'; actionRequired: boolean }> = {
  task_overdue: { notifType: 'tm_task_overdue', priority: 'high', actionRequired: true },
  task_submitted: { notifType: 'tm_task_submitted', priority: 'medium', actionRequired: true },
  extension_requested: { notifType: 'tm_extension_requested', priority: 'medium', actionRequired: true },
};

export async function generateTaskBridgeNotifications(userId: string): Promise<GenerateResult> {
  const created: Notification[] = [];
  const today = new Date();
  const morningSlot = `${today.toISOString().split('T')[0]}T08:00:00.000Z`;
  const oneDayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Query recent task_notifications from PG for DG-relevant types
    const bridgeTypeKeys = Object.keys(BRIDGE_TYPES);
    const placeholders = bridgeTypeKeys.map((_, i) => `$${i + 1}`).join(', ');

    const result = await query(
      `SELECT tn.id, tn.type, tn.task_id, tn.title, tn.message, tn.created_at,
              t.title as task_title, u.full_name as assignee_name, t.agency
       FROM task_notifications tn
       LEFT JOIN tasks t ON t.id = tn.task_id
       LEFT JOIN users u ON u.id = tn.user_id
       WHERE tn.type::text IN (${placeholders})
         AND tn.created_at >= $${bridgeTypeKeys.length + 1}
       ORDER BY tn.created_at DESC
       LIMIT 20`,
      [...bridgeTypeKeys, oneDayAgo]
    );

    for (const row of result.rows) {
      const config = BRIDGE_TYPES[row.type];
      if (!config) continue;

      const taskTitle = row.task_title || row.title || 'Untitled Task';
      const bodyParts: string[] = [];
      if (row.assignee_name) bodyParts.push(row.assignee_name);
      if (row.agency) bodyParts.push(row.agency);
      if (row.message) bodyParts.push(row.message);

      const inserted = await insertNotification({
        user_id: userId,
        type: config.notifType,
        title: `${row.type === 'task_overdue' ? 'Task overdue' : row.type === 'task_submitted' ? 'Task submitted' : 'Extension requested'}: ${taskTitle}`,
        body: bodyParts.join(' — '),
        icon: 'task',
        priority: config.priority,
        reference_type: 'task',
        reference_id: row.task_id || row.id,
        reference_url: '/admin',
        scheduled_for: morningSlot,
        category: 'tasks',
        source_module: 'task-management',
        action_required: config.actionRequired,
        action_type: row.type === 'task_submitted' ? 'review' : row.type === 'extension_requested' ? 'review' : 'view',
        metadata: {
          pg_notification_id: row.id,
          task_id: row.task_id,
          assignee: row.assignee_name,
          agency: row.agency,
          original_type: row.type,
        },
      });
      if (inserted) created.push(inserted);
    }
  } catch (err) {
    // task_notifications table may not exist yet
    if ((err as { code?: string }).code !== '42P01') {
      console.error('Error generating task bridge notifications:', err);
    }
  }

  return { count: created.length, notifications: created };
}
