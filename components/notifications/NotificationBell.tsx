'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from './NotificationProvider';

export function NotificationBell() {
  const { unreadCount, isPanelOpen, openPanel, closePanel } = useNotifications();
  const [shaking, setShaking] = useState(false);
  const prevCount = useRef(unreadCount);

  // Shake when unread count increases
  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 600);
      return () => clearTimeout(timer);
    }
    prevCount.current = unreadCount;
  }, [unreadCount]);

  return (
    <button
      onClick={() => (isPanelOpen ? closePanel() : openPanel())}
      className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <Bell
        className={`h-5 w-5 text-white/70 hover:text-white/90 transition-colors ${shaking ? 'animate-bell-shake' : ''}`}
      />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#d4af37] text-[#0a1628] text-[10px] font-bold px-1 leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
