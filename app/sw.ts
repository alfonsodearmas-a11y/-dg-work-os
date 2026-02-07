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
