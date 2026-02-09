'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Calendar, CheckSquare, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications } from './NotificationProvider';
import type { Notification } from '@/lib/notifications';

function ToastIcon({ type }: { type: string }) {
  if (type === 'meeting_minutes_ready') return <FileText className="h-4 w-4 text-[#3b82f6]" />;
  if (type.startsWith('meeting')) return <Calendar className="h-4 w-4 text-[#d4af37]" />;
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

function SingleToast({
  notification,
  index,
  onDismiss,
}: {
  notification: Notification;
  index: number;
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);
  const pausedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startDismissTimer = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (!pausedRef.current) {
        setExiting(true);
        setTimeout(() => onDismiss(notification.id), 300);
      }
    }, 5000);
  }, [notification.id, onDismiss]);

  useEffect(() => {
    startDismissTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startDismissTimer]);

  const handleMouseEnter = () => {
    pausedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    pausedRef.current = false;
    startDismissTimer();
  };

  const handleClick = () => {
    if (notification.reference_url) {
      router.push(notification.reference_url);
    }
    onDismiss(notification.id);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={`relative max-w-sm w-full bg-[#1a2744]/95 backdrop-blur-md border border-[#2d3a52] rounded-xl shadow-lg cursor-pointer transition-all duration-300 ${
        exiting ? 'opacity-0 translate-x-full' : 'animate-slide-in-right'
      }`}
      style={{ marginTop: index > 0 ? '8px' : '0' }}
    >
      {/* Priority accent bar */}
      <div
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${notification.priority === 'urgent' ? 'animate-pulse-gold' : ''}`}
        style={{ backgroundColor: priorityColor(notification.priority) }}
      />

      <div className="flex items-start gap-3 p-3 pl-4">
        <div className="mt-0.5 flex-shrink-0">
          <ToastIcon type={notification.type} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium leading-snug">{notification.title}</p>
          {notification.body && (
            <p className="text-xs text-white/40 mt-0.5 truncate">{notification.body}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
          className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5 text-white/40" />
        </button>
      </div>
    </div>
  );
}

export function NotificationToast() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-[60] flex flex-col items-end">
      {toasts.map((toast, i) => (
        <SingleToast
          key={toast.id}
          notification={toast}
          index={i}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  );
}
