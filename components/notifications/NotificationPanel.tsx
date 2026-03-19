'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Bell } from 'lucide-react';
import { useNotifications } from './NotificationProvider';
import { useNotificationsWithTiers } from '@/hooks/use-notifications';
import { NotificationItem } from './notification-item';
import { resolveNotificationUrl } from './notification-utils';
import type { Notification } from '@/lib/notifications';

// Re-export for backward compatibility (NotificationToast, ActivityPanel import from here)
export { resolveNotificationUrl } from './notification-utils';

type FilterMode = 'all' | 'unread' | 'action_required' | 'critical';
type CategoryFilter = string | null;

const CATEGORY_PILLS = [
  { key: null, label: 'All' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'projects', label: 'Projects' },
  { key: 'kpi', label: 'KPI' },
  { key: 'oversight', label: 'Oversight' },
  { key: 'mentions', label: 'Mentions' },
] as const;

function getTimeGroup(scheduledFor: string): string {
  const now = new Date();
  const date = new Date(scheduledFor);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 'Now';

  const today = now.toDateString();
  const dateStr = date.toDateString();
  if (dateStr === today) return 'Earlier Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toDateString()) return 'Yesterday';

  if (diffHours < 7 * 24) return 'This Week';
  return 'Older';
}

export function NotificationPanel() {
  const router = useRouter();
  const { notifications, isPanelOpen, closePanel, markAsRead, markAllRead, dismissAll, actionRequiredCount } = useNotifications();
  const { criticalCount } = useNotificationsWithTiers();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null);

  const filtered = useMemo(() => {
    let result = notifications;

    // Status-level filters
    if (filter === 'unread') result = result.filter(n => !n.read_at);
    if (filter === 'action_required') result = result.filter(n => n.action_required);
    if (filter === 'critical') result = result.filter(n => n.importance_tier === 'critical');

    // Category-level filters
    if (categoryFilter === 'mentions') {
      result = result.filter(n => n.event_type === 'comment_mention' || n.event_type === 'comment_reply');
    } else if (categoryFilter) {
      result = result.filter(n => n.category === categoryFilter);
    }

    return result;
  }, [notifications, filter, categoryFilter]);

  const notifPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen, closePanel]);

  useEffect(() => {
    if (!isPanelOpen || !notifPanelRef.current) return;
    const focusable = notifPanelRef.current.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }, [isPanelOpen]);

  if (!isPanelOpen) return null;

  // Group notifications
  const groups = new Map<string, Notification[]>();
  for (const n of filtered) {
    const group = getTimeGroup(n.scheduled_for);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(n);
  }

  const groupOrder = ['Now', 'Earlier Today', 'Yesterday', 'This Week', 'Older'];

  const handleRead = (n: Notification) => {
    if (!n.read_at) markAsRead(n.id);
    const url = resolveNotificationUrl(n);
    if (url) {
      router.push(url);
      closePanel();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[51]"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div ref={notifPanelRef} role="dialog" aria-modal="true" aria-labelledby="notification-panel-title" className="fixed z-[52] md:top-0 md:right-0 md:bottom-0 md:w-full md:max-w-[400px] md:animate-slide-in-right bottom-0 left-0 right-0 max-h-[80vh] md:max-h-none rounded-t-2xl md:rounded-none bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border-l border-navy-800/60 shadow-[-8px_0_32px_rgba(0,0,0,0.5)] flex flex-col">
        {/* Mobile handle */}
        <div className="md:hidden flex justify-center pt-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800/50 flex-shrink-0">
          <h2 id="notification-panel-title" className="text-white font-semibold text-base">Notifications</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              className="text-xs text-gold-500 hover:text-gold-400 transition-colors px-2 py-1"
            >
              Mark all read
            </button>
            <button
              onClick={closePanel}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4 text-white/60" />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="px-4 pt-3 pb-1 flex-shrink-0 space-y-2">
          {/* Status filter row */}
          <div className="flex gap-1.5">
            {([
              { key: 'all' as FilterMode, label: 'All' },
              { key: 'unread' as FilterMode, label: 'Unread' },
              { key: 'action_required' as FilterMode, label: `Action${actionRequiredCount > 0 ? ` (${actionRequiredCount})` : ''}` },
              { key: 'critical' as FilterMode, label: `Critical${criticalCount > 0 ? ` (${criticalCount})` : ''}` },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-2.5 py-1.5 rounded-full transition-colors ${
                  filter === f.key
                    ? f.key === 'critical'
                      ? 'bg-red-500/20 text-red-400 font-semibold'
                      : 'bg-gold-500/20 text-gold-500 font-semibold'
                    : 'bg-white/5 text-white/40 hover:text-white/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Category filter row */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORY_PILLS.map(c => (
              <button
                key={c.key ?? 'all'}
                onClick={() => setCategoryFilter(c.key)}
                className={`text-xs px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                  categoryFilter === c.key
                    ? 'bg-white/15 text-white font-semibold'
                    : 'bg-white/5 text-white/40 hover:text-white/60'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="h-10 w-10 text-white/10 mb-3" />
              <p className="text-white/40 text-sm font-medium">
                {filter !== 'all' || categoryFilter ? 'No matching notifications' : "You're all caught up"}
              </p>
              <p className="text-white/20 text-xs mt-1">
                {filter !== 'all' || categoryFilter ? 'Try a different filter' : 'No notifications to show'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-navy-800/30">
              {groupOrder.map(group => {
                const items = groups.get(group);
                if (!items || items.length === 0) return null;
                return (
                  <div key={group} className="py-2">
                    <p className="px-4 py-1.5 text-xs uppercase tracking-wider text-white/30 font-semibold">
                      {group}
                    </p>
                    {items.map(n => (
                      <NotificationItem key={n.id} notification={n} onRead={handleRead} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-navy-800/50 px-4 py-2 flex-shrink-0">
            <button
              onClick={dismissAll}
              className="text-xs text-white/30 hover:text-white/50 transition-colors w-full text-center py-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </>
  );
}
