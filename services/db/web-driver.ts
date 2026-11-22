import type { Row, ScriptableDriver, SqlParam, Stmt } from './driver';
import { idbGet, idbSet } from './idb';

const DB_KEY = 'main';
const SAVE_DELAY_MS = 200;

// biome-ignore lint/suspicious/noExplicitAny: sqlite-wasm's typings are incomplete for init options and capi.
type Sqlite3 = any;

function bind(params: SqlParam[] = []) {
  return params.map((p) => (typeof p === 'boolean' ? Number(p) : p));
}

export async function createWebDriver(): Promise<ScriptableDriver & { flush(): Promise<void> }> {
  // Served from public/sqlite (see scripts/prepare-assets.ts); not bundled.
  const moduleUrl = '/sqlite/index.mjs';
  const { default: init } = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl
  )) as {
    default: (opts: object) => Promise<Sqlite3>;
  };
  const sqlite3: Sqlite3 = await init({
    locateFile: (file: string) => `/sqlite/${file}`,
    print: () => {},
    printErr: (...args: unknown[]) => console.error('[sqlite]', ...args),
  });
  const db = new sqlite3.oo1.DB(':memory:', 'c');

  const saved = await idbGet<Uint8Array>('db', DB_KEY);
  if (saved && saved.byteLength > 0) {
    const ptr = sqlite3.wasm.allocFromTypedArray(saved);
    const flags =
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
    db.checkRc(
      sqlite3.capi.sqlite3_deserialize(
        db.pointer,
        'main',
        ptr,
        saved.byteLength,
        saved.byteLength,
        flags,
      ),
    );
  }
  db.exec('PRAGMA foreign_keys = ON;');

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<void> = Promise.resolve();

  const save = () => {
    timer = null;
    const bytes: Uint8Array = sqlite3.capi.sqlite3_js_db_export(db);
    pending = pending.then(() => idbSet('db', DB_KEY, bytes));
    return pending;
  };
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };
  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      await save();
    }
    await pending;
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  }

  return {
    dialect: 'sqlite',
    async select<T = Row>(sql: string, params?: SqlParam[]) {
      return db.exec({
        sql,
        bind: bind(params),
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as T[];
    },
    async execute(sql, params) {
      db.exec({ sql, bind: bind(params) });
      scheduleSave();
      return db.changes() as number;
    },
    async batch(statements: Stmt[]) {
      let changes = 0;
      db.transaction(() => {
        for (const s of statements) {
          db.exec({ sql: s.sql, bind: bind(s.params) });
          changes += db.changes() as number;
        }
      });
      scheduleSave();
      return changes;
    },
    async execScript(sql) {
      db.exec(sql);
      scheduleSave();
    },
    flush,
  };
}
