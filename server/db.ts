import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Row, ScriptableDriver, SqlParam, Stmt } from '@/services/db/driver';
import { migrate } from '@/services/db/migrate';
import { serverConfig } from './config';

function bind(params: SqlParam[] = []) {
  return params.map((p) => (typeof p === 'boolean' ? Number(p) : p));
}

export async function createSqliteDriver(path: string): Promise<ScriptableDriver> {
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec(
    'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
  );
  // node:sqlite is synchronous, so a batch can't interleave with other requests.
  return {
    dialect: 'sqlite',
    async select<T = Row>(sql: string, params?: SqlParam[]) {
      return raw.prepare(sql).all(...bind(params)) as T[];
    },
    async execute(sql, params) {
      return Number(raw.prepare(sql).run(...bind(params)).changes);
    },
    async batch(statements: Stmt[]) {
      let changes = 0;
      raw.exec('BEGIN IMMEDIATE');
      try {
        for (const s of statements)
          changes += Number(raw.prepare(s.sql).run(...bind(s.params)).changes);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
      return changes;
    },
    async execScript(sql) {
      raw.exec(sql);
    },
  };
}

/** Rewrite `?` placeholders to Postgres `$n` (our SQL never puts `?` inside literals). */
export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function createPostgresDriver(url: string, poolSize = 10): Promise<ScriptableDriver> {
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;
  const pool = new Pool({
    connectionString: url,
    max: poolSize,
  });
  type Client = {
    query: (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  };

  const make = (q: Client['query']): ScriptableDriver => ({
    dialect: 'postgres',
    async select<T = Row>(sql: string, params?: SqlParam[]) {
      return (await q(toPgPlaceholders(sql), bind(params))).rows as T[];
    },
    async execute(sql, params) {
      return (await q(toPgPlaceholders(sql), bind(params))).rowCount ?? 0;
    },
    async batch(statements) {
      const client = await pool.connect();
      let changes = 0;
      try {
        await client.query('BEGIN');
        for (const s of statements)
          changes += (await client.query(toPgPlaceholders(s.sql), bind(s.params))).rowCount ?? 0;
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      return changes;
    },
    async execScript(sql) {
      await q(sql);
    },
  });

  const driver = make((sql, params) => pool.query(sql, params));
  driver.session = async (fn) => {
    const client = await pool.connect();
    try {
      return await fn(make((sql, params) => client.query(sql, params)));
    } finally {
      client.release();
    }
  };
  return driver;
}

const globalKey = Symbol.for('inquizitive.serverDb');
type GlobalWithDb = typeof globalThis & { [globalKey]?: Promise<ScriptableDriver> };

/** Process-wide database handle (survives dev hot reloads). */
export function serverDb(): Promise<ScriptableDriver> {
  const g = globalThis as GlobalWithDb;
  g[globalKey] ??= (async () => {
    const c = serverConfig();
    const db =
      c.dbKind === 'postgres'
        ? await createPostgresDriver(c.DATABASE_URL, c.DATABASE_POOL_SIZE)
        : await createSqliteDriver(c.DATABASE_URL.replace(/^sqlite:(\/\/)?/, ''));
    await migrate(db);
    return db;
  })();
  g[globalKey].catch(() => {
    delete g[globalKey];
  });
  return g[globalKey];
}
