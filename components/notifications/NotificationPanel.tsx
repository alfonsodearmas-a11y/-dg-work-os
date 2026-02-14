'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, Bell, Calendar, CheckSquare, FileText, Building2, BarChart3, Eye, UserCheck } from 'lucide-react';
import { useNotifications } from './NotificationProvider';
import type { Notification } from '@/lib/notifications';

type FilterMode = 'all' | 'unread' | 'action_required';
type CategoryFilter = string | null;

const CATEGORY_PILLS = [
  { key: null, label: 'All' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'projects', label: 'Projects' },
  { key: 'kpi', label: 'KPI' },
  { key: 'oversight', label: 'Oversight' },
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

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationIcon({ type, category }: { type: string; category?: string }) {
  // Meeting types
  if (type === 'meeting_minutes_ready') return <FileText className="h-4 w-4 text-[#3b82f6]" />;
  if (type.startsWith('meeting')) return <Calendar className="h-4 w-4 text-[#d4af37]" />;

  // Project types
  if (category === 'projects' || type.startsWith('project_')) return <Building2 className="h-4 w-4 text-[#f59e0b]" />;

  // KPI types
  if (category === 'kpi' || type.startsWith('kpi_')) return <BarChart3 className="h-4 w-4 text-[#8b5cf6]" />;

  // Oversight types
  if (category === 'oversight' || type.startsWith('oversight_')) return <Eye className="h-4 w-4 text-[#06b6d4]" />;

  // Task management bridge types
  if (type.startsWith('tm_')) return <UserCheck className="h-4 w-4 text-[#10b981]" />;

  // Default: task
  return <CheckSquare className="h-4 w-4 text-[#22c55e]" />;
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#d4af37';
    case 'high': return '#3b82f6';
    case 'medium': return '#64748b';
    default: return 'transparent';
  }
}

function actionLabel(actionType: string | null | undefined): string {
  switch (actionType) {
    case 'review': return 'Review';
    case 'acknowledge': return 'Ack';
    default: return 'View';
  }
}

function NotificationCard({ notification, onRead }: { notification: Notification; onRead: (n: Notification) => void }) {
  const isUnread = !notification.read_at;

  return (
    <button
      onClick={() => onRead(notification)}
      className="w-full text-left flex gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group relative"
    >
      {/* Priority accent bar */}
      <div
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${notification.priority === 'urgent' ? 'animate-pulse-gold' : ''}`}
        style={{ backgroundColor: priorityColor(notification.priority) }}
      />

      {/* Icon */}
      <div className="mt-0.5 pl-2 flex-shrink-0">
        <NotificationIcon type={notification.type} category={notification.category} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isUnread ? 'text-white font-medium' : 'text-white/70'}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-white/40 mt-0.5 truncate">{notification.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-white/30">{relativeTime(notification.scheduled_for)}</p>
          {notification.action_required && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#d4af37]/20 text-[#d4af37]">
              {actionLabel(notification.action_type)}
            </span>
          )}
        </div>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <div className="flex-shrink-0 mt-2">
          <div className="w-2 h-2 rounded-full bg-[#d4af37]" />
        </div>
      )}
    </button>
  );
}

export function NotificationPanel() {
  const router = useRouter();
  const { notifications, isPanelOpen, closePanel, markAsRead, markAllRead, dismissAll, actionRequiredCount } = useNotifications();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null);

  const filtered = useMemo(() => {
    let result = notifications;
    if (filter === 'unread') result = result.filter(n => !n.read_at);
    if (filter === 'action_required') result = result.filter(n => n.action_required);
    if (categoryFilter) result = result.filter(n => n.category === categoryFilter);
    return result;
  }, [notifications, filter, categoryFilter]);

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
    if (n.reference_url) {
      router.push(n.reference_url);
      closePanel();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[51]"
        onClick={closePanel}
      />

      {/* Panel */}
      <div className="fixed z-[52] md:top-0 md:right-0 md:bottom-0 md:w-full md:max-w-[400px] md:animate-slide-in-right bottom-0 left-0 right-0 max-h-[80vh] md:max-h-none rounded-t-2xl md:rounded-none bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border-l border-[#2d3a52]/60 shadow-[-8px_0_32px_rgba(0,0,0,0.5)] flex flex-col">
        {/* Mobile handle */}
        <div className="md:hidden flex justify-center pt-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3a52]/50 flex-shrink-0">
          <h2 className="text-white font-semibold text-base">Notifications</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              className="text-xs text-[#d4af37] hover:text-[#f4d03f] transition-colors px-2 py-1"
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
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                  filter === f.key
                    ? 'bg-[#d4af37]/20 text-[#d4af37] font-semibold'
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
                className={`text-[11px] px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${
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
            <div className="divide-y divide-[#2d3a52]/30">
              {groupOrder.map(group => {
                const items = groups.get(group);
                if (!items || items.length === 0) return null;
                return (
                  <div key={group} className="py-2">
                    <p className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-white/30 font-semibold">
                      {group}
                    </p>
                    {items.map(n => (
                      <NotificationCard key={n.id} notification={n} onRead={handleRead} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-[#2d3a52]/50 px-4 py-2 flex-shrink-0">
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
