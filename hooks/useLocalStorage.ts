'use client';

import { useCallback, useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.storageArea === window.localStorage) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const getSnapshot = useCallback((): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  const raw = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );

  let value: T = initial;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      // corrupt entry — fall back to initial
    }
  }

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new StorageEvent('storage', { key, storageArea: window.localStorage }));
      } catch {
        // quota / private mode — drop persistence
      }
    },
    [key],
  );

  return [value, set];
}
