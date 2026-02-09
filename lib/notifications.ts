import { supabaseAdmin } from './db';
import { fetchTasks } from './notion';
import { fetchWeekEvents } from './google-calendar';

// --- Types ---

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  icon: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reference_type: 'meeting' | 'task' | null;
  reference_id: string | null;
  reference_url: string | null;
  scheduled_for: string;
  delivered_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  push_sent: boolean;
  created_at: string;
}

export interface NotificationPrefs {
  meeting_reminder_24h: boolean;
  meeting_reminder_1h: boolean;
  meeting_reminder_15m: boolean;
  task_due_reminders: boolean;
  task_overdue_alerts: boolean;
  meeting_minutes_ready: boolean;
  do_not_disturb: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

// --- CRUD ---

export async function getNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; limit?: number; offset?: number }
): Promise<Notification[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let query = supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Notification[];
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
    .is('dismissed_at', null)
    .lte('scheduled_for', new Date().toISOString());

  if (error) throw error;
  return count || 0;
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllRead(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

export async function dismissNotification(notificationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function dismissAll(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('dismissed_at', null);
  if (error) throw error;
}

export async function markDelivered(notificationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw error;
}

// --- Dedup helper ---

async function exists(type: string, referenceId: string, scheduledFor: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('type', type)
    .eq('reference_id', referenceId)
    .eq('scheduled_for', scheduledFor);

  if (error) return false;
  return (count || 0) > 0;
}

async function insertNotification(n: Omit<Notification, 'id' | 'delivered_at' | 'read_at' | 'dismissed_at' | 'push_sent' | 'created_at'>): Promise<Notification | null> {
  if (await exists(n.type, n.reference_id || '', n.scheduled_for)) {
    return null;
  }
  const { data, error } = await supabaseAdmin.from('notifications').insert(n).select().single();
  if (error) {
    console.error('Failed to insert notification:', error);
    return null;
  }
  return data as Notification;
}

// --- Meeting notification generation ---

export async function generateMeetingNotifications(userId: string): Promise<{ count: number; notifications: Notification[] }> {
  const created: Notification[] = [];

  try {
    const events = await fetchWeekEvents();
    const now = new Date();
    const cutoff = new Date(now.getTime() + 25 * 60 * 60 * 1000); // next 25 hours

    for (const event of events) {
      if (!event.start_time || event.all_day) continue;

      const start = new Date(event.start_time);
      if (start > cutoff) continue;

      const msUntil = start.getTime() - now.getTime();
      const title = event.title || 'Untitled Meeting';

      // 24h reminder
      if (msUntil > 23 * 60 * 60 * 1000 && msUntil <= 25 * 60 * 60 * 1000) {
        const scheduledFor = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const inserted = await insertNotification({
          user_id: userId,
          type: 'meeting_reminder_24h',
          title: `Tomorrow: ${title}`,
          body: `Meeting at ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          icon: 'calendar',
          priority: 'low',
          reference_type: 'meeting',
          reference_id: event.google_id,
          reference_url: '/',
          scheduled_for: scheduledFor,
        });
        if (inserted) created.push(inserted);
      }

      // 1h reminder
      if (msUntil > 0 && msUntil <= 2 * 60 * 60 * 1000) {
        const scheduledFor = new Date(start.getTime() - 60 * 60 * 1000).toISOString();
        const inserted = await insertNotification({
          user_id: userId,
          type: 'meeting_reminder_1h',
          title: `In 1 hour: ${title}`,
          body: formatMeetingBody(event),
          icon: 'calendar',
          priority: 'medium',
          reference_type: 'meeting',
          reference_id: event.google_id,
          reference_url: '/',
          scheduled_for: scheduledFor,
        });
        if (inserted) created.push(inserted);
      }

      // 15min reminder
      if (msUntil > 0 && msUntil <= 30 * 60 * 1000) {
        const scheduledFor = new Date(start.getTime() - 15 * 60 * 1000).toISOString();
        const inserted = await insertNotification({
          user_id: userId,
          type: 'meeting_reminder_15m',
          title: `Starting soon: ${title}`,
          body: formatMeetingBody(event),
          icon: 'calendar',
          priority: 'high',
          reference_type: 'meeting',
          reference_id: event.google_id,
          reference_url: '/',
          scheduled_for: scheduledFor,
        });
        if (inserted) created.push(inserted);
      }
    }
  } catch (err) {
    console.error('Error generating meeting notifications:', err);
  }

  return { count: created.length, notifications: created };
}

function formatMeetingBody(event: { location?: string | null; attendees?: Array<{ display_name?: string; email: string }> }): string {
  const parts: string[] = [];
  if (event.location) parts.push(event.location);
  if (event.attendees && event.attendees.length > 0) {
    const names = event.attendees
      .slice(0, 3)
      .map(a => a.display_name || a.email.split('@')[0]);
    const suffix = event.attendees.length > 3 ? ` +${event.attendees.length - 3}` : '';
    parts.push(`With: ${names.join(', ')}${suffix}`);
  }
  return parts.join(' | ');
}

// --- Task notification generation ---

export async function generateTaskNotifications(userId: string): Promise<{ count: number; notifications: Notification[] }> {
  const created: Notification[] = [];

  try {
    const tasks = await fetchTasks();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const morningSlot = `${today}T08:00:00.000Z`;

    for (const task of tasks) {
      if (!task.due_date) continue;

      const dueDate = task.due_date.split('T')[0];
      const title = task.title || 'Untitled Task';

      if (dueDate === tomorrow) {
        const inserted = await insertNotification({
          user_id: userId,
          type: 'task_due_tomorrow',
          title: `Due tomorrow: ${title}`,
          body: task.agency ? `Agency: ${task.agency}` : '',
          icon: 'task',
          priority: 'medium',
          reference_type: 'task',
          reference_id: task.notion_id,
          reference_url: task.url || '/',
          scheduled_for: morningSlot,
        });
        if (inserted) created.push(inserted);
      }

      if (dueDate === today) {
        const inserted = await insertNotification({
          user_id: userId,
          type: 'task_due_today',
          title: `Due today: ${title}`,
          body: task.agency ? `Agency: ${task.agency}` : '',
          icon: 'task',
          priority: 'high',
          reference_type: 'task',
          reference_id: task.notion_id,
          reference_url: task.url || '/',
          scheduled_for: morningSlot,
        });
        if (inserted) created.push(inserted);
      }

      if (dueDate < today) {
        const daysOverdue = Math.floor((now.getTime() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000));
        const inserted = await insertNotification({
          user_id: userId,
          type: 'task_overdue',
          title: `Overdue: ${title}`,
          body: `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue${task.agency ? ` | ${task.agency}` : ''}`,
          icon: 'task',
          priority: 'urgent',
          reference_type: 'task',
          reference_id: task.notion_id,
          reference_url: task.url || '/',
          scheduled_for: morningSlot,
        });
        if (inserted) created.push(inserted);
      }
    }
  } catch (err) {
    console.error('Error generating task notifications:', err);
  }

  return { count: created.length, notifications: created };
}

// --- Meeting minutes ready notification generation ---

export async function generateMinutesReadyNotifications(userId: string): Promise<{ count: number; notifications: Notification[] }> {
  const created: Notification[] = [];

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: minutes, error } = await supabaseAdmin
      .from('meeting_minutes')
      .select('id, title, processed_at')
      .eq('status', 'completed')
      .gte('processed_at', oneDayAgo);

    if (error || !minutes) return { count: 0, notifications: [] };

    for (const m of minutes) {
      const inserted = await insertNotification({
        user_id: userId,
        type: 'meeting_minutes_ready',
        title: `Minutes ready: ${m.title}`,
        body: 'AI-generated meeting minutes are ready for review',
        icon: 'document',
        priority: 'medium',
        reference_type: 'meeting',
        reference_id: m.id,
        reference_url: `/meetings/${m.id}`,
        scheduled_for: m.processed_at || new Date().toISOString(),
      });
      if (inserted) created.push(inserted);
    }
  } catch (err) {
    console.error('Error generating minutes notifications:', err);
  }

  return { count: created.length, notifications: created };
}

// --- Orchestrator ---

export async function generateAll(userId: string): Promise<{
  meetings: number;
  tasks: number;
  minutes: number;
  allNotifications: Notification[];
}> {
  const [meetingResult, taskResult, minutesResult] = await Promise.all([
    generateMeetingNotifications(userId),
    generateTaskNotifications(userId),
    generateMinutesReadyNotifications(userId),
  ]);
  return {
    meetings: meetingResult.count,
    tasks: taskResult.count,
    minutes: minutesResult.count,
    allNotifications: [
      ...meetingResult.notifications,
      ...taskResult.notifications,
      ...minutesResult.notifications,
    ],
  };
}

// --- Preferences ---

export async function getPreferences(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return {
      meeting_reminder_24h: true,
      meeting_reminder_1h: true,
      meeting_reminder_15m: true,
      task_due_reminders: true,
      task_overdue_alerts: true,
      meeting_minutes_ready: true,
      do_not_disturb: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
    };
  }

  return {
    meeting_reminder_24h: data.meeting_reminder_24h,
    meeting_reminder_1h: data.meeting_reminder_1h,
    meeting_reminder_15m: data.meeting_reminder_15m,
    task_due_reminders: data.task_due_reminders,
    task_overdue_alerts: data.task_overdue_alerts,
    meeting_minutes_ready: data.meeting_minutes_ready,
    do_not_disturb: data.do_not_disturb,
    quiet_hours_start: data.quiet_hours_start,
    quiet_hours_end: data.quiet_hours_end,
  };
}

export async function updatePreferences(
  userId: string,
  prefs: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const { error } = await supabaseAdmin
    .from('notification_preferences')
    .upsert({
      user_id: userId,
      ...prefs,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
  return getPreferences(userId);
}
