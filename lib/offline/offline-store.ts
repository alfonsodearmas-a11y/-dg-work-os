import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'dg-work-os-offline';
const DB_VERSION = 2;

const STORES = [
  'agency-data',
  'projects',
  'tasks',
  'calendar',
  'briefing',
  'ai-conversations',
  'sync-queue',
] as const;

export type StoreName = (typeof STORES)[number];

interface OfflineRecord<T = unknown> {
  key: string;
  data: T;
  updated_at: number; // timestamp ms
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 stores
        if (oldVersion < 1) {
          for (const store of ['agency-data', 'projects', 'tasks', 'calendar', 'briefing', 'ai-conversations'] as const) {
            if (!db.objectStoreNames.contains(store)) {
              db.createObjectStore(store, { keyPath: 'key' });
            }
          }
        }
        // v2: add sync-queue store
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('sync-queue')) {
            db.createObjectStore('sync-queue', { keyPath: 'key' });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function saveToOffline<T>(
  storeName: StoreName,
  key: string,
  data: T
): Promise<void> {
  const db = await getDB();
  const record: OfflineRecord<T> = { key, data, updated_at: Date.now() };
  await db.put(storeName, record);
}

export async function getFromOffline<T>(
  storeName: StoreName,
  key: string
): Promise<OfflineRecord<T> | null> {
  const db = await getDB();
  const record = await db.get(storeName, key);
  return (record as OfflineRecord<T>) || null;
}

export async function getOfflineAge(
  storeName: StoreName,
  key: string
): Promise<number> {
  const record = await getFromOffline(storeName, key);
  if (!record) return Infinity;
  return Math.round((Date.now() - record.updated_at) / 60000); // minutes
}

export async function clearOfflineStore(storeName: StoreName): Promise<void> {
  const db = await getDB();
  await db.clear(storeName);
}

/**
 * Clear all offline data across all stores.
 * Useful on logout or when switching users.
 */
export async function clearAllOfflineData(): Promise<void> {
  const db = await getDB();
  await Promise.all(STORES.map((store) => db.clear(store)));
}
