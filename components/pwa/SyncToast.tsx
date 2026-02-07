'use client';

import { useEffect, useState, useCallback } from 'react';
import { Check, AlertTriangle, X } from 'lucide-react';
import type { SyncEvent } from '@/hooks/useOnlineStatus';

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

let toastId = 0;

export function SyncToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]); // Keep max 3
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('dg-sync');

    channel.onmessage = (event: MessageEvent<SyncEvent>) => {
      const { type, url, error } = event.data;
      if (type === 'sync-complete') {
        addToast('success', 'All changes synced');
      } else if (type === 'sync-error') {
        const path = url ? new URL(url).pathname : 'request';
        addToast('error', `Sync failed: ${path}${error ? ` — ${error}` : ''}`);
      }
    };

    return () => channel.close();
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-14 right-4 z-[999] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg border text-xs font-medium animate-slide-up ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/15 text-red-400 border-red-500/30'
          }`}
        >
          {toast.type === 'success' ? (
            <Check className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="flex-1 min-w-0 truncate">{toast.message}</span>
          <button
            onClick={() => dismissToast(toast.id)}
            className="text-current opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
