'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  type: string;
  task_id: string | null;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export function TaskNotificationBell({ basePath = '/dashboard' }: { basePath?: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/tm/notifications?limit=10');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data.notifications);
        setUnreadCount(data.data.unreadCount);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markRead = async (id: string) => {
    await fetch(`/api/tm/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await fetch('/api/tm/notifications/read-all', { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleNotifClick = (notif: Notification) => {
    if (!notif.is_read) markRead(notif.id);
    if (notif.task_id) {
      router.push(`${basePath}/tasks/${notif.task_id}`);
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-[#2d3a52]/50 text-[#64748b] hover:text-white transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a2744] border border-[#2d3a52] rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d3a52]">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#d4af37] hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-sm text-[#64748b] py-8">No notifications</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-[#2d3a52]/30 transition-colors border-b border-[#2d3a52]/50 ${!n.is_read ? 'bg-[#d4af37]/5' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-[#d4af37] mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{n.title}</p>
                      {n.message && <p className="text-xs text-[#64748b] mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[10px] text-[#64748b] mt-1">
                        {new Date(n.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
