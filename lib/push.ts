import webpush from 'web-push';
import { supabaseAdmin } from './db';
import type { Notification } from './notifications';
import { getPreferences } from './notifications';

// --- VAPID configuration (lazy init to avoid build-time errors) ---

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@dgworkos.gov.gy';
  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
  }
}

// --- Types ---

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  device_info: string | null;
  platform: string;
  active: boolean;
  created_at: string;
  last_used_at: string;
}

// --- Subscription CRUD ---

export function parsePlatform(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/macintosh|mac os/.test(ua)) return 'macos';
  if (/android/.test(ua)) return 'android';
  if (/windows/.test(ua)) return 'windows';
  return 'other';
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string
): Promise<PushSubscriptionRecord> {
  const platform = parsePlatform(userAgent);

  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        device_info: userAgent.slice(0, 500),
        platform,
        active: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as PushSubscriptionRecord;
}

export async function getSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true);

  if (error) throw error;
  return (data || []) as PushSubscriptionRecord[];
}

export async function getAllSubscriptionsForUser(userId: string): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('last_used_at', { ascending: false });

  if (error) throw error;
  return (data || []) as PushSubscriptionRecord[];
}

export async function deactivateSubscription(endpoint: string): Promise<void> {
  await supabaseAdmin
    .from('push_subscriptions')
    .update({ active: false })
    .eq('endpoint', endpoint);
}

export async function deleteSubscription(id: string): Promise<void> {
  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('id', id);
}

export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
}

// --- Push payload builders ---

function buildPushPayload(notification: Notification): object {
  const { type, title, body, priority, reference_url, id } = notification;

  // Emoji prefix by type
  let pushTitle = title;
  if (type.startsWith('meeting_reminder') || type === 'meeting_starting') {
    pushTitle = `📅 ${title}`;
  } else if (type === 'meeting_minutes_ready') {
    pushTitle = `📋 ${title}`;
  } else if (type === 'task_due_tomorrow' || type === 'task_due_today') {
    pushTitle = `✅ ${title}`;
  } else if (type === 'task_overdue') {
    pushTitle = `⚠️ ${title}`;
  }

  // Tag for notification grouping — same meeting replaces older reminder
  let tag = `dg-${type}-${notification.reference_id || id}`;
  if (type.startsWith('meeting_reminder')) {
    tag = `dg-meeting-${notification.reference_id || id}`;
  }

  return {
    title: pushTitle,
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag,
    data: {
      url: reference_url || '/',
      notificationId: id,
      type,
      priority,
    },
  };
}

// --- Rate limiting ---

async function getPushCountLastHour(userId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('push_sent', true)
    .gte('created_at', oneHourAgo);

  if (error) return 0;
  return count || 0;
}

const MAX_PUSH_PER_HOUR = 10;

// --- Quiet hours check ---

function isInQuietHours(prefs: { quiet_hours_start: string | null; quiet_hours_end: string | null }): boolean {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) return false;

  const now = new Date();
  const [startH, startM] = prefs.quiet_hours_start.split(':').map(Number);
  const [endH, endM] = prefs.quiet_hours_end.split(':').map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Wraps midnight (e.g., 22:00 - 07:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

// --- Core send function ---

export async function sendPushForNotification(notification: Notification): Promise<boolean> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  ensureVapidConfigured();

  // Check preferences
  const prefs = await getPreferences(notification.user_id);
  if (prefs.do_not_disturb) return false;
  if (isInQuietHours(prefs)) return false;

  // Check preference for this notification type
  const typeToPreference: Record<string, keyof typeof prefs> = {
    meeting_reminder_24h: 'meeting_reminder_24h',
    meeting_reminder_1h: 'meeting_reminder_1h',
    meeting_reminder_15m: 'meeting_reminder_15m',
    meeting_starting: 'meeting_reminder_15m',
    meeting_minutes_ready: 'meeting_minutes_ready',
    task_due_tomorrow: 'task_due_reminders',
    task_due_today: 'task_due_reminders',
    task_overdue: 'task_overdue_alerts',
  };
  const prefKey = typeToPreference[notification.type];
  if (prefKey && !prefs[prefKey]) return false;

  // Rate limit
  const sentCount = await getPushCountLastHour(notification.user_id);
  if (sentCount >= MAX_PUSH_PER_HOUR) return false;

  // Get subscriptions
  const subscriptions = await getSubscriptions(notification.user_id);
  if (subscriptions.length === 0) return false;

  const payload = JSON.stringify(buildPushPayload(notification));
  let anySent = false;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        payload,
        { TTL: 60 * 60 } // 1 hour TTL
      );
      anySent = true;

      // Update last_used_at
      await supabaseAdmin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id);
    } catch (err: unknown) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expired or unsubscribed
        await deactivateSubscription(sub.endpoint);
      } else {
        console.error(`Push send failed for ${sub.endpoint}:`, err);
      }
    }
  }

  // Mark push_sent on the notification
  if (anySent) {
    await supabaseAdmin
      .from('notifications')
      .update({ push_sent: true })
      .eq('id', notification.id);
  }

  return anySent;
}

// --- Send push for multiple notifications (batch, with rate limiting + priority sorting) ---

export async function sendPushForNotifications(notifications: Notification[]): Promise<number> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return 0;
  if (notifications.length === 0) return 0;

  // Sort by priority: urgent > high > medium > low
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...notifications].sort(
    (a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  );

  let sent = 0;
  for (const notif of sorted) {
    const ok = await sendPushForNotification(notif);
    if (ok) sent++;
  }
  return sent;
}

// --- Send a test push ---

export async function sendTestPush(userId: string): Promise<{ sent: number; total: number }> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { sent: 0, total: 0 };
  }
  ensureVapidConfigured();

  const subscriptions = await getSubscriptions(userId);
  const payload = JSON.stringify({
    title: '🔔 Test Notification',
    body: 'Push notifications are working! You will receive alerts about meetings and tasks.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'dg-test',
    data: { url: '/admin', notificationId: 'test', type: 'test', priority: 'medium' },
  });

  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        payload,
        { TTL: 300 }
      );
      sent++;
    } catch (err: unknown) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 410 || error.statusCode === 404) {
        await deactivateSubscription(sub.endpoint);
      }
    }
  }

  return { sent, total: subscriptions.length };
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || '';
}
