// Minimal IndexedDB key-value store for larger cached datasets (the NFL player list).

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

const DB_NAME = 'sleeper-companion';
const STORE = 'cache';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export const idbStore: KeyValueStore = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
  set: async <T>(key: string, value: T) => {
    await run('readwrite', (s) => s.put(value, key));
  },
};

/** In-memory fallback (used when IndexedDB is unavailable, and in tests). */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      map.set(key, value);
    },
  };
}
