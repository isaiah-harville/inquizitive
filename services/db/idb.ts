const DB_NAME = 'inquizitive';
const STORES = ['db', 'media'] as const;
type Store = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES)
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run<T>(
  store: Store,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const idbGet = <T>(store: Store, key: string) =>
  run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const idbSet = (store: Store, key: string, value: unknown) =>
  run(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined);
export const idbDelete = (store: Store, key: string) =>
  run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
