import { query } from './db-pg';
import nodemailer from 'nodemailer';

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskNotificationType =
  | 'task_assigned' | 'task_overdue' | 'task_rejected' | 'task_submitted'
  | 'task_verified' | 'extension_requested' | 'extension_decided'
  | 'comment_added' | 'task_reminder';

export interface TaskNotification {
  id: string;
  user_id: string;
  type: TaskNotificationType;
  task_id: string | null;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

// ── In-app notifications ───────────────────────────────────────────────────

export async function createTaskNotification(
  userId: string,
  type: TaskNotificationType,
  taskId: string | null,
  title: string,
  message?: string
): Promise<TaskNotification> {
  const result = await query(
    `INSERT INTO task_notifications (user_id, type, task_id, title, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, taskId, title, message || null]
  );
  return result.rows[0];
}

export async function getTaskNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; limit?: number; offset?: number }
): Promise<{ notifications: TaskNotification[]; total: number }> {
  const conditions = ['user_id = $1'];
  const params: any[] = [userId];
  let idx = 2;

  if (opts?.unreadOnly) {
    conditions.push('is_read = false');
  }

  const where = conditions.join(' AND ');
  const limit = opts?.limit || 20;
  const offset = opts?.offset || 0;

  const [data, count] = await Promise.all([
    query(
      `SELECT * FROM task_notifications WHERE ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM task_notifications WHERE ${where}`, params),
  ]);

  return {
    notifications: data.rows,
    total: parseInt(count.rows[0].count),
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await query(
    'SELECT COUNT(*) FROM task_notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  return parseInt(result.rows[0].count);
}

export async function markNotificationRead(id: string): Promise<void> {
  await query('UPDATE task_notifications SET is_read = true WHERE id = $1', [id]);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await query('UPDATE task_notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
}

// ── Email sending ──────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mail.me.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_APP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  });
}

export async function sendTaskEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    console.log(`[task-email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[task-email] Failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}
