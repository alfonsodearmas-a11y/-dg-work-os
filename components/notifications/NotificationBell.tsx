'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from './NotificationProvider';

export function NotificationBell() {
  const { unreadCount, isPanelOpen, openPanel, closePanel } = useNotifications();
  const [shaking, setShaking] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const prevCount = useRef(unreadCount);

  // Shake when unread count increases, always update prevCount
  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 600);
      prevCount.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevCount.current = unreadCount;
  }, [unreadCount]);

  // Animate badge entrance
  useEffect(() => {
    if (unreadCount > 0) {
      const raf = requestAnimationFrame(() => setBadgeVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setBadgeVisible(false);
    }
  }, [unreadCount]);

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

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
        <span
          role="status"
          aria-label={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-gold-500 text-navy-950 text-[11px] font-bold px-1 leading-none pointer-events-none transition-transform duration-200 ease-out origin-center ${badgeVisible ? 'scale-100' : 'scale-0'}`}
        >
          {badgeLabel}
        </span>
      )}
    </button>
  );
}
