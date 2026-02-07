'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSyncQueueCount } from '@/lib/offline/sync-queue-tracker';

export interface SyncEvent {
  type: 'sync-start' | 'sync-success' | 'sync-error' | 'sync-complete';
  url?: string;
  error?: string;
}

interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
  isSyncing: boolean;
  syncQueueCount: number;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const wasOfflineRef = useRef(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncQueueCount, setSyncQueueCount] = useState(0);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    if (wasOfflineRef.current) {
      setWasOffline(true);
      setTimeout(() => setWasOffline(false), 5000);
    }
    // Refresh sync queue count when coming online
    getSyncQueueCount().then(setSyncQueueCount).catch(() => {});
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    wasOfflineRef.current = true;
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // BroadcastChannel listener for sync events from SW
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('dg-sync');

    channel.onmessage = (event: MessageEvent<SyncEvent>) => {
      const { type } = event.data;
      switch (type) {
        case 'sync-start':
          setIsSyncing(true);
          break;
        case 'sync-success':
          // Decrement queue count on each successful sync
          setSyncQueueCount((prev) => Math.max(0, prev - 1));
          break;
        case 'sync-complete':
          setIsSyncing(false);
          setSyncQueueCount(0);
          break;
        case 'sync-error':
          setIsSyncing(false);
          // Refresh actual count from IDB
          getSyncQueueCount().then(setSyncQueueCount).catch(() => {});
          break;
      }
    };

    return () => channel.close();
  }, []);

  // Poll sync queue count periodically when offline
  useEffect(() => {
    if (isOnline) return;

    const poll = () => getSyncQueueCount().then(setSyncQueueCount).catch(() => {});
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

  return { isOnline, wasOffline, isSyncing, syncQueueCount };
}
