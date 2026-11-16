// Тонка обгортка над IndexedDB. Усі дані застосунку живуть у цій базі на пристрої.

const NAME = 'gym-tracker';
const VERSION = 1;

/** Сховища та їхні ключі. */
export const STORES = { days: 'id', exercises: 'id', logs: 'id', drafts: 'id', settings: 'key' };

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [store, keyPath] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('Не вдалося відкрити базу даних'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function tx(stores, mode, work) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error || new Error('Помилка бази даних'));
    t.onabort = () => reject(t.error || new Error('Операцію з базою даних перервано'));
    work(t);
  }));
}

export async function getAll(store) {
  let req;
  await tx([store], 'readonly', (t) => { req = t.objectStore(store).getAll(); });
  return req.result;
}

export function put(store, value) {
  return tx([store], 'readwrite', (t) => { t.objectStore(store).put(value); });
}

export function putMany(store, values) {
  return tx([store], 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
  });
}

export function del(store, key) {
  return tx([store], 'readwrite', (t) => { t.objectStore(store).delete(key); });
}

/** Одна транзакція з кількома змінами: ops = [{ store, put } | { store, del }]. */
export function batch(ops) {
  if (!ops.length) return Promise.resolve();
  const stores = [...new Set(ops.map((o) => o.store))];
  return tx(stores, 'readwrite', (t) => {
    for (const o of ops) {
      const os = t.objectStore(o.store);
      if ('del' in o) os.delete(o.del);
      else os.put(o.put);
    }
  });
}

/** Повністю замінює вміст усіх сховищ однією транзакцією. */
export function replaceAll(data) {
  const names = Object.keys(STORES);
  return tx(names, 'readwrite', (t) => {
    for (const name of names) {
      const os = t.objectStore(name);
      os.clear();
      for (const v of data[name] || []) os.put(v);
    }
  });
}
