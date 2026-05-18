import { supabaseAdmin } from './db';
import { fetchWeekEvents } from './google-calendar';
import { MINISTRY_ROLES } from './people-types';
import { logger } from '@/lib/logger';
import { NotificationDeliveryError } from './notifications/errors';

// --- Types ---

export type NotificationCategory = 'meetings' | 'tasks' | 'projects' | 'kpi' | 'oversight' | 'system';
export type NotificationReferenceType = 'meeting' | 'task' | 'project' | 'kpi' | 'oversight' | 'document' | 'system' | null;

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  icon: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reference_type: NotificationReferenceType;
  reference_id: string | null;
  reference_url: string | null;
  scheduled_for: string;
  delivered_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  push_sent: boolean;
  created_at: string;
  category: NotificationCategory;
  source_module: string;
  action_required: boolean;
  action_type: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string | null;
  // Tier system columns (migration 051) — optional for backward compat
  actor_id?: string | null;
  event_type?: string | null;
  importance_tier?: 'critical' | 'important' | 'informational' | null;
  entity_type?: string | null;
  entity_id?: string | null;
  parent_entity_type?: string | null;
  parent_entity_id?: string | null;
  seen_at?: string | null;
  email_sent_at?: string | null;
  email_queued_at?: string | null;
  digest_eligible?: boolean;
  digest_batch_id?: string | null;
}

export type EventEmailPref = 'instant' | 'digest' | 'off';

export interface EventPrefEntry {
  in_app: boolean;
  email: EventEmailPref;
}

export type EventPreferencesMap = {
  comment_mention: EventPrefEntry;
  comment_reply: EventPrefEntry;
  task_assigned: EventPrefEntry;
  task_blocked: EventPrefEntry;
  task_due_soon: EventPrefEntry;
  task_status_change: EventPrefEntry;
  task_completed: EventPrefEntry;
  subtask_completed: EventPrefEntry;
  task_watcher_notification: EventPrefEntry;
  task_daily_reminder: EventPrefEntry;
  referral_direction_given: EventPrefEntry;
};

export type DigestFrequency = 'daily' | 'weekly' | 'off';

export interface NotificationPrefs {
  meeting_reminder_24h: boolean;
  meeting_reminder_1h: boolean;
  meeting_reminder_15m: boolean;
  task_due_reminders: boolean;
  task_overdue_alerts: boolean;
  meeting_minutes_ready: boolean;
  projects_enabled: boolean;
  kpi_enabled: boolean;
  oversight_enabled: boolean;
  do_not_disturb: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  event_preferences: EventPreferencesMap;
  digest_frequency: DigestFrequency;
  digest_time: string;
}

// --- CRUD ---

export async function getNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; category?: string; actionRequiredOnly?: boolean; limit?: number; offset?: number }
): Promise<Notification[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let query = supabaseAdmin
    .from('notifications')
    .select('id, user_id, type, title, body, icon, priority, reference_type, reference_id, reference_url, scheduled_for, delivered_at, read_at, dismissed_at, push_sent, created_at, category, source_module, action_required, action_type, expires_at, metadata, updated_at, actor_id, event_type, importance_tier, entity_type, entity_id, parent_entity_type, parent_entity_id, seen_at')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.unreadOnly) {
    query = query.is('read_at', null);
  }
  if (opts?.category) {
    query = query.eq('category', opts.category);
  }
  if (opts?.actionRequiredOnly) {
    query = query.eq('action_required', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Notification[];
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
    .is('dismissed_at', null)
    .lte('scheduled_for', new Date().toISOString());

  if (error) throw error;
  return count || 0;
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);
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

export async function dismissNotification(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);
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

export async function markDelivered(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);
  if (error) throw error;
}

// --- Dedup helper ---

async function exists(type: string, referenceId: string, scheduledFor: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .eq('reference_id', referenceId)
    .eq('scheduled_for', scheduledFor);

  if (error) return false;
  return (count || 0) > 0;
}

type InsertNotificationInput = Omit<Notification, 'id' | 'delivered_at' | 'read_at' | 'dismissed_at' | 'push_sent' | 'created_at' | 'category' | 'source_module' | 'action_required' | 'action_type' | 'expires_at' | 'metadata' | 'updated_at'> & {
  category?: NotificationCategory;
  source_module?: string;
  action_required?: boolean;
  action_type?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
};

// Maps from notification type/category → user preference key (shared with push.ts)
export const TYPE_TO_PREFERENCE: Record<string, keyof NotificationPrefs> = {
  meeting_reminder_24h: 'meeting_reminder_24h',
  meeting_reminder_1h: 'meeting_reminder_1h',
  meeting_reminder_15m: 'meeting_reminder_15m',
  meeting_starting: 'meeting_reminder_15m',
  meeting_minutes_ready: 'meeting_minutes_ready',
  task_due_tomorrow: 'task_due_reminders',
  task_due_today: 'task_due_reminders',
  task_overdue: 'task_overdue_alerts',
};

export const CATEGORY_TO_PREFERENCE: Record<string, keyof NotificationPrefs> = {
  projects: 'projects_enabled',
  kpi: 'kpi_enabled',
  oversight: 'oversight_enabled',
};

// Short-lived preference cache to avoid N+1 lookups within a single generateAll() cycle
const _prefsCache = new Map<string, { prefs: NotificationPrefs; ts: number }>();
const PREFS_CACHE_TTL_MS = 30_000;

function getCachedPreferences(userId: string): NotificationPrefs | undefined {
  const entry = _prefsCache.get(userId);
  if (entry && Date.now() - entry.ts < PREFS_CACHE_TTL_MS) return entry.prefs;
  _prefsCache.delete(userId);
  return undefined;
}

export async function insertNotification(n: InsertNotificationInput): Promise<Notification | null> {
  // Check user preferences before inserting (cached within generateAll cycle).
  // A failure here used to be caught-and-proceed — that silent masking is exactly
  // what hid the 2026-04-13 schema drift. Now the error propagates as a typed
  // NotificationDeliveryError so callers can log structured context and decide.
  try {
    let prefs = getCachedPreferences(n.user_id);
    if (!prefs) {
      prefs = await getPreferences(n.user_id);
      _prefsCache.set(n.user_id, { prefs, ts: Date.now() });
    }
    if (prefs.do_not_disturb) return null;

    const typePref = TYPE_TO_PREFERENCE[n.type];
    if (typePref && prefs[typePref] === false) return null;

    const catPref = CATEGORY_TO_PREFERENCE[n.category || ''];
    if (catPref && prefs[catPref] === false) return null;
  } catch (err) {
    if (err instanceof NotificationDeliveryError) throw err;
    throw new NotificationDeliveryError({
      eventType: n.type,
      recipientId: n.user_id,
      parentEntityType: null,
      parentEntityId: null,
      cause: err,
    });
  }

  if (await exists(n.type, n.reference_id || '', n.scheduled_for)) {
    return null;
  }
  const row = {
    ...n,
    category: n.category ?? 'system',
    source_module: n.source_module ?? 'system',
    action_required: n.action_required ?? false,
    action_type: n.action_type ?? null,
    expires_at: n.expires_at ?? null,
    metadata: n.metadata ?? {},
  };
  const { data, error } = await supabaseAdmin.from('notifications').insert(row).select().single();
  if (error) {
    // Legacy path: parent_entity_type / parent_entity_id are not tracked here
    // (this predates the v2 entity taxonomy). Pass null and accept the gap —
    // structured logs still carry user_id, event_type (= legacy n.type), and
    // the underlying pg error code/name/message.
    throw new NotificationDeliveryError({
      eventType: n.type,
      recipientId: n.user_id,
      parentEntityType: null,
      parentEntityId: null,
      cause: error,
    });
  }
  return data as Notification;
}

// --- Meeting notification generation ---

export async function generateMeetingNotifications(userId: string, ctx?: GenerateContext): Promise<{ count: number; notifications: Notification[] }> {
  const created: Notification[] = [];

  try {
    // Only generate for users with a connected Google Calendar
    const { data: token } = await supabaseAdmin
      .from('integration_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google_calendar')
      .maybeSingle();

    if (!token) {
      return { count: 0, notifications: [] };
    }

    // Fetch events from this user's calendar
    const events = await fetchWeekEvents(userId, { hoursAhead: 25 });
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
          category: 'meetings',
          source_module: 'calendar',
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
          category: 'meetings',
          source_module: 'calendar',
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
          category: 'meetings',
          source_module: 'calendar',
        });
        if (inserted) created.push(inserted);
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error generating meeting notifications');
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

export async function generateTaskNotifications(userId: string, ctx?: GenerateContext): Promise<{ count: number; notifications: Notification[] }> {
  const created: Notification[] = [];

  try {
    const role = ctx?.role ?? (await supabaseAdmin.from('users').select('role').eq('id', userId).single()).data?.role;

    // Fetch tasks from native tasks table
    let taskQuery = supabaseAdmin
      .from('tasks')
      .select('id, title, agency, due_date, status, owner_user_id, assigned_by_user_id')
      .neq('status', 'done');

    // Non-executive users only see tasks they own or assigned
    const isExecutive = role && MINISTRY_ROLES.includes(role);
    if (!isExecutive) {
      taskQuery = taskQuery.or(`owner_user_id.eq.${userId},assigned_by_user_id.eq.${userId}`);
    }

    const { data: tasks, error: tasksErr } = await taskQuery;

    if (tasksErr) throw tasksErr;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const morningSlot = `${today}T08:00:00.000Z`;

    for (const task of tasks || []) {
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
          reference_id: task.id,
          reference_url: `/tasks`,
          scheduled_for: morningSlot,
          category: 'tasks',
          source_module: 'tasks',
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
          reference_id: task.id,
          reference_url: `/tasks`,
          scheduled_for: morningSlot,
          category: 'tasks',
          source_module: 'tasks',
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
          reference_id: task.id,
          reference_url: `/tasks`,
          scheduled_for: morningSlot,
          category: 'tasks',
          source_module: 'tasks',
        });
        if (inserted) created.push(inserted);
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error generating task notifications');
  }

  return { count: created.length, notifications: created };
}

// --- Meeting minutes ready notification generation ---

export async function generateMinutesReadyNotifications(userId: string): Promise<{ count: number; notifications: Notification[] }> {
  const created: Notification[] = [];

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: minutes, error } = await supabaseAdmin
      .from('meetings')
      .select('id, title, updated_at')
      .eq('status', 'ANALYZED')
      .gte('updated_at', oneDayAgo);

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
        scheduled_for: m.updated_at || new Date().toISOString(),
        category: 'meetings',
        source_module: 'calendar',
      });
      if (inserted) created.push(inserted);
    }
  } catch (err) {
    logger.error({ err }, 'Error generating minutes notifications');
  }

  return { count: created.length, notifications: created };
}

// --- Orchestrator ---

export type GenerateResult = { count: number; notifications: Notification[] };

/** User context fetched once in generateAll() and passed to each generator. */
export interface GenerateContext {
  userId: string;
  role: string;
  prefs: NotificationPrefs;
}

export async function generateAll(userId: string): Promise<{
  meetings: number;
  tasks: number;
  minutes: number;
  projects: number;
  kpi: number;
  oversight: number;
  taskBridge: number;
  allNotifications: Notification[];
}> {
  // Fetch user context once — avoids N+1 role/preference lookups across generators
  const [{ data: userRow }, prefs] = await Promise.all([
    supabaseAdmin.from('users').select('role').eq('id', userId).single(),
    getPreferences(userId),
  ]);

  const ctx: GenerateContext = {
    userId,
    role: userRow?.role ?? 'officer',
    prefs,
  };

  // Import new generators dynamically to avoid circular deps
  const [
    { generateProjectNotifications },
    { generateKpiNotifications },
    { generateOversightNotifications },
    { generateTaskBridgeNotifications },
  ] = await Promise.all([
    import('./notification-generators/projects'),
    import('./notification-generators/kpi'),
    import('./notification-generators/oversight'),
    import('./notification-generators/task-bridge'),
  ]);

  const [meetingResult, taskResult, minutesResult, projectResult, kpiResult, oversightResult, taskBridgeResult] = await Promise.all([
    generateMeetingNotifications(userId, ctx),
    generateTaskNotifications(userId, ctx),
    generateMinutesReadyNotifications(userId),
    generateProjectNotifications(ctx),
    generateKpiNotifications(ctx),
    generateOversightNotifications(ctx),
    generateTaskBridgeNotifications(ctx),
  ]);

  return {
    meetings: meetingResult.count,
    tasks: taskResult.count,
    minutes: minutesResult.count,
    projects: projectResult.count,
    kpi: kpiResult.count,
    oversight: oversightResult.count,
    taskBridge: taskBridgeResult.count,
    allNotifications: [
      ...meetingResult.notifications,
      ...taskResult.notifications,
      ...minutesResult.notifications,
      ...projectResult.notifications,
      ...kpiResult.notifications,
      ...oversightResult.notifications,
      ...taskBridgeResult.notifications,
    ],
  };
}

// --- Preferences ---

export const DEFAULT_EVENT_PREFERENCES: EventPreferencesMap = {
  comment_mention: { in_app: true, email: 'instant' },
  comment_reply: { in_app: true, email: 'instant' },
  task_assigned: { in_app: true, email: 'instant' },
  task_blocked: { in_app: true, email: 'instant' },
  task_due_soon: { in_app: true, email: 'digest' },
  task_status_change: { in_app: true, email: 'digest' },
  task_completed: { in_app: true, email: 'digest' },
  subtask_completed: { in_app: true, email: 'off' },
  // Watchers should hear about events as they happen — same default as
  // task_assigned. Recipients can lower this in /admin notification prefs.
  task_watcher_notification: { in_app: true, email: 'instant' },
  // The daily digest synthesizes one row per (user, task) per day; the row
  // itself is digest-only. 'instant' would defeat the purpose.
  task_daily_reminder: { in_app: true, email: 'digest' },
  // Minister direction on a referral is high-signal for the referring DG.
  referral_direction_given: { in_app: true, email: 'instant' },
};

export async function getPreferences(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('meeting_reminder_24h, meeting_reminder_1h, meeting_reminder_15m, task_due_reminders, task_overdue_alerts, meeting_minutes_ready, projects_enabled, kpi_enabled, oversight_enabled, do_not_disturb, quiet_hours_start, quiet_hours_end, event_preferences, digest_frequency, digest_time')
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
      projects_enabled: true,
      kpi_enabled: true,
      oversight_enabled: true,
      do_not_disturb: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
      event_preferences: { ...DEFAULT_EVENT_PREFERENCES },
      digest_frequency: 'daily',
      digest_time: '07:00',
    };
  }

  return {
    meeting_reminder_24h: data.meeting_reminder_24h,
    meeting_reminder_1h: data.meeting_reminder_1h,
    meeting_reminder_15m: data.meeting_reminder_15m,
    task_due_reminders: data.task_due_reminders,
    task_overdue_alerts: data.task_overdue_alerts,
    meeting_minutes_ready: data.meeting_minutes_ready,
    projects_enabled: data.projects_enabled ?? true,
    kpi_enabled: data.kpi_enabled ?? true,
    oversight_enabled: data.oversight_enabled ?? true,
    do_not_disturb: data.do_not_disturb,
    quiet_hours_start: data.quiet_hours_start,
    quiet_hours_end: data.quiet_hours_end,
    event_preferences: data.event_preferences
      ? { ...DEFAULT_EVENT_PREFERENCES, ...(data.event_preferences as Partial<EventPreferencesMap>) }
      : { ...DEFAULT_EVENT_PREFERENCES },
    digest_frequency: (data.digest_frequency as DigestFrequency) ?? 'daily',
    digest_time: (data.digest_time as string) ?? '07:00',
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
