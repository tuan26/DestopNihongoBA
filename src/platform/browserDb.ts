import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SqlJsDatabase } from '../core/db/sqljs';

const DB_NAME = 'japanese-ba-vocab';
const STORE = 'files';
const KEY = 'vocab.db';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function load(): Promise<Uint8Array | undefined> {
  const db = await idb();
  return new Promise((resolve) => {
    const r = db.transaction(STORE).objectStore(STORE).get(KEY);
    r.onsuccess = () => resolve(r.result as Uint8Array | undefined);
    r.onerror = () => resolve(undefined);
  });
}

async function save(data: Uint8Array): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Browser preview / E2E database: SQLite (sql.js) persisted to IndexedDB.
 * Not used inside the desktop app.
 */
export async function openBrowserDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const data = await load().catch(() => undefined);
  const db = await SqlJsDatabase.create(SQL, data);
  let timer: ReturnType<typeof setTimeout> | undefined;
  db.onWrite = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void save(db.export()), 300);
  };
  window.addEventListener('beforeunload', () => void save(db.export()));
  return db;
}

export async function resetBrowserDatabase(): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
  });
}
