'use client';

import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface ConnectivityPillProps {
  isOnline: boolean;
  isSyncing: boolean;
  syncQueueCount: number;
}

export function ConnectivityPill({ isOnline, isSyncing, syncQueueCount }: ConnectivityPillProps) {
  if (isOnline && !isSyncing && syncQueueCount === 0) return null;

  let icon: React.ReactNode;
  let label: string;
  let classes: string;

  if (isSyncing) {
    icon = <RefreshCw className="h-3 w-3 animate-spin" />;
    label = syncQueueCount > 0 ? `Syncing ${syncQueueCount}...` : 'Syncing...';
    classes = 'bg-[#d4af37]/15 text-[#d4af37] border-[#d4af37]/30';
  } else if (!isOnline) {
    icon = <WifiOff className="h-3 w-3" />;
    label = syncQueueCount > 0 ? `Offline \u00b7 ${syncQueueCount} queued` : 'Offline';
    classes = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  } else {
    // Online with pending queue items (not yet syncing)
    icon = <Wifi className="h-3 w-3" />;
    label = `${syncQueueCount} pending`;
    classes = 'bg-[#d4af37]/10 text-[#d4af37]/70 border-[#d4af37]/20';
  }

  return (
    <div
      className={`fixed bottom-4 left-4 z-[997] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border backdrop-blur-sm transition-all duration-300 ${classes}`}
    >
      {icon}
      {label}
    </div>
  );
}
