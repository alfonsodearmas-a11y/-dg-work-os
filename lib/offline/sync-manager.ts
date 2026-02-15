import { saveToOffline, getFromOffline, getOfflineAge, type StoreName } from './offline-store';
import { getCacheKey } from './user-context';

export interface FetchResult<T> {
  data: T;
  source: 'network' | 'offline';
  age: number; // minutes since last update
}

interface FetchWithOfflineOptions extends RequestInit {
  /** Fetch timeout in ms (default: 8000) */
  timeout?: number;
  /** Max retry attempts for transient failures (default: 2) */
  maxRetries?: number;
}

/** Wrap fetch with an AbortController-based timeout */
function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const existingSignal = options.signal;

  // If the caller already passed a signal, abort our controller when it aborts
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort());
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Returns true for errors that are worth retrying (network issues, 5xx) */
function isRetryable(error: unknown, status?: number): boolean {
  if (status && status >= 500) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true; // timeout
  if (error instanceof TypeError) return true; // network failure
  return false;
}

/** Exponential backoff: 500ms, 1500ms, 3500ms... */
function backoffDelay(attempt: number): number {
  return Math.min(500 * Math.pow(2, attempt) - 500, 5000);
}

/**
 * Fetch from network with timeout, retry, and automatic IndexedDB caching.
 * Falls back to cached data when offline or all retries exhausted.
 */
export async function fetchWithOffline<T>(
  apiUrl: string,
  storeName: StoreName,
  cacheKey: string,
  options?: FetchWithOfflineOptions
): Promise<FetchResult<T>> {
  const { timeout = 8000, maxRetries = 2, ...fetchOptions } = options || {};
  const namespacedKey = getCacheKey(cacheKey);

  let lastError: unknown;

  // Attempt fetch with retries for transient failures
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(apiUrl, fetchOptions, timeout);
      if (!response.ok) {
        // Don't retry 4xx client errors
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        // 5xx — retryable
        lastError = new Error(`HTTP ${response.status}`);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, backoffDelay(attempt)));
          continue;
        }
        throw lastError;
      }
      const data = (await response.json()) as T;
      // Save to IndexedDB for offline use (fire-and-forget)
      saveToOffline(storeName, namespacedKey, data).catch(() => {});
      return { data, source: 'network', age: 0 };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryable(err)) {
        await new Promise(r => setTimeout(r, backoffDelay(attempt)));
        continue;
      }
    }
  }

  // All attempts failed — try offline store
  const cached = await getFromOffline<T>(storeName, namespacedKey);
  if (cached) {
    const age = await getOfflineAge(storeName, namespacedKey);
    return { data: cached.data, source: 'offline', age };
  }
  throw new Error('No network and no cached data');
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
