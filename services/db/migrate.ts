import type { ScriptableDriver } from './driver';
import { MIGRATIONS, type Migration } from './migrations.gen';

export const LATEST_SCHEMA_VERSION = MIGRATIONS.sqlite.at(-1)?.version ?? 0;

/** Current schema version: PRAGMA user_version (SQLite) or schema_migrations (Postgres). */
export async function schemaVersion(db: ScriptableDriver): Promise<number> {
  if (db.dialect === 'sqlite') {
    const [row] = await db.select<{ user_version: number }>('PRAGMA user_version');
    return Number(row?.user_version ?? 0);
  }
  await db.execScript(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)',
  );
  const [row] = await db.select<{ v: number | string | null }>(
    'SELECT max(version) AS v FROM schema_migrations',
  );
  return Number(row?.v ?? 0);
}

/**
 * Apply pending migrations (browser, server and tests). The desktop app runs
 * the same SQLite files from Rust at startup, with a pre-migration backup.
 * On Postgres an advisory lock makes concurrent replicas migrate one at a time.
 */
export async function migrate(
  db: ScriptableDriver,
  migrations: Migration[] = MIGRATIONS[db.dialect],
): Promise<number> {
  // Advisory locks are per-connection, so pin one for the whole run.
  if (db.session) return db.session((pinned) => runMigrations(pinned, migrations));
  return runMigrations(db, migrations);
}

async function runMigrations(db: ScriptableDriver, migrations: Migration[]): Promise<number> {
  const latest = migrations.at(-1)?.version ?? 0;
  const pg = db.dialect === 'postgres';
  if (pg) await db.execScript('SELECT pg_advisory_lock(7171)');
  try {
    if (!pg) await db.execScript('PRAGMA foreign_keys = ON;');
    const current = await schemaVersion(db);
    if (current > latest) {
      throw new Error(`Database schema v${current} is newer than this app supports (v${latest}).`);
    }
    for (const m of migrations) {
      if (m.version <= current) continue;
      const record = pg
        ? `INSERT INTO schema_migrations (version, applied_at) VALUES (${m.version}, ${Date.now()});`
        : `PRAGMA user_version = ${m.version};`;
      await db.execScript(`BEGIN;\n${m.sql}\n${record}\nCOMMIT;`);
    }
    return schemaVersion(db);
  } finally {
    if (pg) await db.execScript('SELECT pg_advisory_unlock(7171)');
  }
}
