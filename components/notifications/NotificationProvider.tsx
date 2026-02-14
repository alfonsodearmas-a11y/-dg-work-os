'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { Notification } from '@/lib/notifications';

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  actionRequiredCount: number;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  dismissAll: () => void;
  toasts: Notification[];
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  actionRequiredCount: 0,
  isPanelOpen: false,
  openPanel: () => {},
  closePanel: () => {},
  markAsRead: () => {},
  markAllRead: () => {},
  dismissAll: () => {},
  toasts: [],
  dismissToast: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const USER_ID = 'dg';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const toastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Listen for navigate messages from service worker (push notification clicks)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'navigate' && event.data?.url) {
        router.push(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handler);
    };
  }, [router]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?user_id=${USER_ID}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // silently fail
    }
  }, []);

  // Compute action required count from current notifications
  const actionRequiredCount = useMemo(
    () => notifications.filter(n => n.action_required && !n.read_at && !n.dismissed_at).length,
    [notifications]
  );

  // Initial load + fire-and-forget generate to ensure fresh notifications
  useEffect(() => {
    fetchNotifications();
    // Trigger generation (safe due to dedup), then re-fetch to pick up any new ones
    fetch('/api/notifications/generate', { method: 'POST' })
      .then(res => { if (res.ok) return res.json(); })
      .then(data => { if (data?.generated?.total > 0) fetchNotifications(); })
      .catch(() => {});
  }, [fetchNotifications]);

  // Periodic check every 60s
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Supabase Realtime subscription
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const client = createClient(url, key);

    const channel = client
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${USER_ID}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          const scheduledFor = new Date(newNotif.scheduled_for);
          const now = new Date();

          if (scheduledFor <= now) {
            deliverNotification(newNotif);
          } else {
            const delay = scheduledFor.getTime() - now.getTime();
            setTimeout(() => deliverNotification(newNotif), delay);
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deliverNotification = useCallback((notif: Notification) => {
    // Add to notifications list
    setNotifications(prev => {
      if (prev.some(n => n.id === notif.id)) return prev;
      return [notif, ...prev];
    });
    setUnreadCount(prev => prev + 1);

    // Show toast (max 3)
    setToasts(prev => {
      if (prev.some(t => t.id === notif.id)) return prev;
      const next = [notif, ...prev].slice(0, 3);
      return next;
    });

    // Auto-dismiss toast after 5s
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== notif.id));
      toastTimers.current.delete(notif.id);
    }, 5000);
    toastTimers.current.set(notif.id, timer);

    // Mark delivered
    fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delivered', id: notif.id }),
    }).catch(() => {});
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', id }),
      });
    } catch {
      // rollback on error
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read', user_id: USER_ID }),
      });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const dismissAllNotifications = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_all', user_id: USER_ID }),
      });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
  }, []);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        actionRequiredCount,
        isPanelOpen,
        openPanel,
        closePanel,
        markAsRead,
        markAllRead,
        dismissAll: dismissAllNotifications,
        toasts,
        dismissToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
