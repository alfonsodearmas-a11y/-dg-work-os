import { saveToOffline, getFromOffline, getOfflineAge, type StoreName } from './offline-store';
import { getCacheKey } from './user-context';

export interface FetchResult<T> {
  data: T;
  source: 'network' | 'offline';
  age: number; // minutes since last update
}

/**
 * Fetch from network with automatic IndexedDB caching.
 * Falls back to cached data when offline.
 */
export async function fetchWithOffline<T>(
  apiUrl: string,
  storeName: StoreName,
  cacheKey: string,
  options?: RequestInit
): Promise<FetchResult<T>> {
  const namespacedKey = getCacheKey(cacheKey);
  try {
    const response = await fetch(apiUrl, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as T;
    // Save to IndexedDB for offline use (fire-and-forget)
    saveToOffline(storeName, namespacedKey, data).catch(() => {});
    return { data, source: 'network', age: 0 };
  } catch {
    // Network failed — try offline store
    const cached = await getFromOffline<T>(storeName, namespacedKey);
    if (cached) {
      const age = await getOfflineAge(storeName, namespacedKey);
      return { data: cached.data, source: 'offline', age };
    }
    throw new Error('No network and no cached data');
  }
}

/**
 * Prefetch all key data stores in the background.
 * Called on app startup when online.
 */
export async function prefetchAllStores(): Promise<void> {
  const fetches: Array<{ url: string; store: StoreName; key: string }> = [
    { url: '/api/briefing', store: 'briefing', key: new Date().toISOString().slice(0, 10) },
    { url: '/api/projects/summary', store: 'projects', key: 'summary' },
    { url: '/api/projects/list', store: 'projects', key: 'list' },
  ];

  await Promise.allSettled(
    fetches.map(({ url, store, key }) =>
      fetchWithOffline(url, store, key).catch(() => {})
    )
  );
}

/**
 * Format age for display.
 */
export function formatAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
