import { DatabaseSync } from 'node:sqlite';
import type { Row, ScriptableDriver, SqlParam, Stmt } from '@/services/db/driver';
import { migrate } from '@/services/db/migrate';

function bind(params: SqlParam[] = []) {
  return params.map((p) => (typeof p === 'boolean' ? Number(p) : p));
}

/** In-memory SQLite (node:sqlite) implementing the app's driver interface. */
export function createNodeDriver(path = ':memory:'): ScriptableDriver & { raw: DatabaseSync } {
  const raw = new DatabaseSync(path);
  return {
    dialect: 'sqlite',
    raw,
    async select<T = Row>(sql: string, params?: SqlParam[]) {
      return raw.prepare(sql).all(...bind(params)) as T[];
    },
    async execute(sql, params) {
      return Number(raw.prepare(sql).run(...bind(params)).changes);
    },
    async batch(statements: Stmt[]) {
      let changes = 0;
      raw.exec('BEGIN');
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

let pg: Promise<ScriptableDriver> | null = null;

/**
 * A fresh, migrated database for one test. SQLite in memory by default;
 * set TEST_DATABASE_URL=postgres://… to run the same suite on PostgreSQL.
 */
export async function createTestDb(): Promise<ScriptableDriver> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const db = createNodeDriver();
    await migrate(db);
    return db;
  }
  const { createPostgresDriver } = await import('@/server/db');
  pg ??= createPostgresDriver(url);
  const db = await pg;
  try {
    await db.execScript('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } catch (e) {
    throw new Error(
      `Can't reach TEST_DATABASE_URL (${e instanceof Error ? e.message : e}). Start one with \`bun run db:up\`.`,
    );
  }
  await migrate(db);
  return db;
}
