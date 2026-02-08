/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  Serwist,
  NetworkFirst,
  CacheFirst,
  NetworkOnly,
  ExpirationPlugin,
  BackgroundSyncPlugin,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SYNC_CHANNEL = 'dg-sync';
const SYNC_QUEUE = 'dg-offline-mutations';

// Background sync plugin for offline mutations
const bgSyncPlugin = new BackgroundSyncPlugin(SYNC_QUEUE, {
  maxRetentionTime: 24 * 60, // 24 hours
  onSync: async ({ queue }) => {
    const bc = new BroadcastChannel(SYNC_CHANNEL);
    bc.postMessage({ type: 'sync-start' });

    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        const response = await fetch(entry.request.clone());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bc.postMessage({ type: 'sync-success', url: entry.request.url });
      } catch (error) {
        await queue.unshiftRequest(entry);
        bc.postMessage({
          type: 'sync-error',
          url: entry.request.url,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        bc.close();
        throw error; // Re-throw to signal retry needed
      }
    }

    bc.postMessage({ type: 'sync-complete' });
    bc.close();
  },
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Static assets: CacheFirst, 30-day expiry
    {
      matcher: ({ request, url }) =>
        request.destination === 'style' ||
        request.destination === 'script' ||
        request.destination === 'font' ||
        request.destination === 'image' ||
        url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'dg-static-assets',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          }),
        ],
      }),
    },
    // Page navigations: NetworkFirst with 3s timeout — exclude /admin/*
    {
      matcher: ({ request, url }) =>
        request.mode === 'navigate' && !url.pathname.startsWith('/admin'),
      handler: new NetworkFirst({
        cacheName: 'dg-pages',
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          }),
        ],
      }),
    },
    // Mutation endpoints: NetworkOnly + BackgroundSync
    {
      matcher: ({ request, url }) =>
        url.pathname.startsWith('/api/') &&
        (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH'),
      handler: new NetworkOnly({
        plugins: [bgSyncPlugin],
      }),
    },
    // All other API routes: NetworkOnly (IndexedDB handles caching)
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },
    // Default cache entries from @serwist/turbopack
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// Listen for skip waiting messages
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// --- Push Notification Handlers ---

const SW_VERSION = 'push-v3';

// Detect iOS/macOS Safari for platform-specific push options
function isApplePlatform(): boolean {
  const ua = self.navigator?.userAgent || '';
  return /iphone|ipad|ipod|macintosh/i.test(ua) && /safari|applewebkit/i.test(ua);
}

// Log to server for remote debugging (fire and forget)
function swLog(eventName: string, detail: string) {
  fetch(new URL('/api/push/log', self.location.origin).href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: eventName, detail: `[${SW_VERSION}] ${detail}` }),
  }).catch(() => {});
}

self.addEventListener('push', (event: PushEvent) => {
  swLog('push_received', `data=${event.data ? 'yes' : 'no'}, apple=${isApplePlatform()}`);

  // ALWAYS show a notification — iOS will revoke push permission if we don't
  const showFallback = () => {
    swLog('push_fallback', 'showing fallback notification');
    return self.registration.showNotification(`DG Work OS (${SW_VERSION})`, {
      body: 'You have a new notification',
    });
  };

  if (!event.data) {
    event.waitUntil(showFallback());
    return;
  }

  let data: {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: { url?: string; notificationId?: string; type?: string; priority?: string };
  };
  try {
    data = event.data.json();
    swLog('push_parsed', `title=${data.title}, body=${data.body?.slice(0, 50)}`);
  } catch (e) {
    swLog('push_parse_error', String(e));
    event.waitUntil(showFallback());
    return;
  }

  // On Apple platforms, use absolute minimum options — only title + body
  // iOS web push silently fails with unsupported options
  const apple = isApplePlatform();

  if (apple) {
    swLog('push_show_apple', `title=${data.title}`);
    event.waitUntil(
      self.registration.showNotification(
        data.title || `DG Work OS (${SW_VERSION})`,
        { body: data.body || 'New notification', data: data.data }
      ).then(() => {
        swLog('push_shown_ok', 'apple notification shown');
      }).catch((err) => {
        swLog('push_show_error', String(err));
        return showFallback();
      })
    );
    return;
  }

  // Non-Apple: full notification options
  const options: NotificationOptions = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-96.png',
    tag: data.tag,
    data: data.data,
    requireInteraction: data.data?.priority === 'urgent',
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  try {
    if ('vibrate' in self.navigator) {
      options.vibrate = data.data?.priority === 'urgent' ? [200, 100, 200] : [100];
    }
  } catch {
    // Vibrate not supported
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'DG Work OS', options).catch(() => showFallback())
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  const notificationId = event.notification.data?.notificationId;

  event.waitUntil(
    (async () => {
      // Mark as read via API
      if (notificationId && notificationId !== 'test') {
        try {
          await fetch(new URL('/api/notifications', self.location.origin).href, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mark_read', id: notificationId }),
          });
        } catch {
          // Best effort
        }
      }

      // Focus existing window or open new one
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          await client.focus();
          client.postMessage({ type: 'navigate', url });
          return;
        }
      }

      await self.clients.openWindow(new URL(url, self.location.origin).href);
    })()
  );
});

// Handle subscription rotation (iOS can silently rotate endpoints)
self.addEventListener('pushsubscriptionchange', ((event: Event & { oldSubscription?: PushSubscription; newSubscription?: PushSubscription }) => {
  event.waitUntil?.(
    (async () => {
      try {
        // Deactivate old subscription
        if (event.oldSubscription) {
          await fetch(new URL('/api/push/subscribe', self.location.origin).href, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
          });
        }

        // Register new subscription
        if (event.newSubscription) {
          const sub = event.newSubscription.toJSON();
          await fetch(new URL('/api/push/subscribe', self.location.origin).href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: 'dg',
              subscription: {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.keys?.p256dh, auth: sub.keys?.auth },
              },
            }),
          });
        }
      } catch {
        // Best effort
      }
    })()
  );
}) as EventListener);
