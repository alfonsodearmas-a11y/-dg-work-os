'use client';

import { Calendar, CheckSquare, FileText, Building2, BarChart3, Eye, UserCheck } from 'lucide-react';
import type { Notification } from '@/lib/notifications';
import { resolveNotificationUrl } from './notification-utils';

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
  if (type === 'meeting_minutes_ready') return <FileText className="h-4 w-4 text-blue-500" />;
  if (type.startsWith('meeting')) return <Calendar className="h-4 w-4 text-gold-500" />;
  if (category === 'projects' || type.startsWith('project_')) return <Building2 className="h-4 w-4 text-[#f59e0b]" />;
  if (category === 'kpi' || type.startsWith('kpi_')) return <BarChart3 className="h-4 w-4 text-[#8b5cf6]" />;
  if (category === 'oversight' || type.startsWith('oversight_')) return <Eye className="h-4 w-4 text-cyan-500" />;
  if (type.startsWith('tm_')) return <UserCheck className="h-4 w-4 text-[#10b981]" />;
  return <CheckSquare className="h-4 w-4 text-green-500" />;
}

import { notificationPriorityColor as priorityColor } from '@/lib/constants/task-styles';

function actionLabel(actionType: string | null | undefined): string {
  switch (actionType) {
    case 'review': return 'Review';
    case 'acknowledge': return 'Ack';
    default: return 'View';
  }
}

/**
 * Resolve the left-border accent color based on importance tier first,
 * falling back to the legacy priority-based color.
 */
function accentColor(notification: Notification, isUnread: boolean): string {
  // Tier-based colors take precedence
  if (notification.importance_tier === 'critical') return '#E24B4A';
  if (notification.importance_tier === 'important') return '#d4af37';

  // Legacy priority-based color
  if (isUnread) return priorityColor(notification.priority) || '#d4af37';
  return priorityColor(notification.priority);
}

interface NotificationItemProps {
  notification: Notification;
  onRead: (n: Notification) => void;
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const isUnread = !notification.read_at;
  const hasLink = !!resolveNotificationUrl(notification);

  return (
    <button
      onClick={() => onRead(notification)}
      className={`w-full text-left flex gap-3 p-3 rounded-lg transition-all duration-150 group relative cursor-pointer
        ${isUnread ? 'bg-white/[0.03]' : ''}
        hover:bg-white/[0.08] active:bg-white/[0.12]`}
    >
      {/* Priority / tier accent bar — doubles as unread indicator */}
      <div
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-full transition-colors ${notification.importance_tier === 'critical' || notification.priority === 'urgent' ? 'animate-pulse-gold' : ''}`}
        style={{ backgroundColor: accentColor(notification, isUnread) }}
      />

      {/* Icon */}
      <div className="mt-0.5 pl-2 flex-shrink-0">
        <NotificationIcon type={notification.type} category={notification.category} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isUnread ? 'text-white font-medium' : 'text-white/50'}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className={`text-xs mt-0.5 truncate ${isUnread ? 'text-white/40' : 'text-white/25'}`}>{notification.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className={`text-xs ${isUnread ? 'text-white/30' : 'text-white/20'}`}>{relativeTime(notification.scheduled_for)}</p>
          {notification.action_required && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gold-500/20 text-gold-500">
              {actionLabel(notification.action_type)}
            </span>
          )}
          {notification.importance_tier === 'critical' && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
              Critical
            </span>
          )}
          {hasLink && (
            <span className="text-xs text-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
              Open &rarr;
            </span>
          )}
        </div>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <div className="flex-shrink-0 mt-2">
          <div className={`w-2 h-2 rounded-full ${notification.importance_tier === 'critical' ? 'bg-red-500' : 'bg-gold-500'}`} />
        </div>
      )}
    </button>
  );
}
