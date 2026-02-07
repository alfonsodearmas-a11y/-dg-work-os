'use client';

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Wifi, WifiOff, Check } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [show, setShow] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
      setSyncing(false);
    } else if (wasOffline) {
      setSyncing(true);
      const timer = setTimeout(() => {
        setSyncing(false);
        setShow(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isOnline, wasOffline]);

  if (!show && !syncing) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[998] transition-all duration-300 ${
        show || syncing ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div
        className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
          syncing
            ? 'bg-emerald-500/15 text-emerald-400 border-b border-emerald-500/30'
            : 'bg-amber-500/15 text-[#d4af37] border-b border-amber-500/30'
        }`}
      >
        {syncing ? (
          <>
            <Check className="h-4 w-4" />
            Data synced
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            You&apos;re offline &mdash; showing cached data
          </>
        )}
      </div>
    </div>
  );
}

export function DataFreshnessPill({ source, age }: { source: 'network' | 'offline'; age: number }) {
  // Only show when data is from offline cache or stale (>5 min)
  if (source === 'network' && age < 5) return null;

  const isStale = age > 1440; // >24 hours
  const label = isStale
    ? 'Data from yesterday'
    : source === 'offline'
      ? `Cached \u00b7 ${formatAge(age)}`
      : `${formatAge(age)}`;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
        isStale
          ? 'bg-red-500/15 text-red-400'
          : 'bg-amber-500/10 text-amber-400/70'
      }`}
    >
      {isStale && '\u26a0 '}
      {label}
    </span>
  );
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
