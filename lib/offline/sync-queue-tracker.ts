/**
 * Read Serwist/Workbox BackgroundSync IndexedDB to count pending requests.
 *
 * Workbox stores background sync requests in an IndexedDB database named
 * "workbox-background-sync" with an object store named "requests".
 * Each queue has its own tagged entries.
 */

const WORKBOX_DB_NAME = 'workbox-background-sync';
const WORKBOX_STORE_NAME = 'requests';
const QUEUE_NAME = 'dg-offline-mutations';

export async function getSyncQueueCount(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(WORKBOX_DB_NAME);

      request.onerror = () => resolve(0);

      request.onsuccess = () => {
        const db = request.result;
        try {
          if (!db.objectStoreNames.contains(WORKBOX_STORE_NAME)) {
            db.close();
            resolve(0);
            return;
          }

          const tx = db.transaction(WORKBOX_STORE_NAME, 'readonly');
          const store = tx.objectStore(WORKBOX_STORE_NAME);
          const getAll = store.getAll();

          getAll.onsuccess = () => {
            const entries = getAll.result as Array<{ queueName?: string }>;
            const count = entries.filter((e) => e.queueName === QUEUE_NAME).length;
            db.close();
            resolve(count);
          };

          getAll.onerror = () => {
            db.close();
            resolve(0);
          };
        } catch {
          db.close();
          resolve(0);
        }
      };
    } catch {
      resolve(0);
    }
  });
}
