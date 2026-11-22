import type { Id } from '@/domain/models';
import { newId, now } from '@/lib/id';
import type { SqlDriver } from '@/services/db/driver';
import { num, numOrNull } from './sql';

export interface ApiToken {
  id: Id;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export async function insertApiToken(
  db: SqlDriver,
  userId: Id,
  name: string,
  tokenHash: string,
): Promise<Id> {
  const id = newId();
  await db.execute(
    'INSERT INTO api_tokens (id, user_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, userId, name.trim().slice(0, 80) || 'Desktop app', tokenHash, now()],
  );
  return id;
}

export async function listApiTokens(db: SqlDriver, userId: Id): Promise<ApiToken[]> {
  const rows = await db.select<{
    id: string;
    name: string;
    created_at: number;
    last_used_at: number | null;
  }>(
    'SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: num(r.created_at),
    lastUsedAt: numOrNull(r.last_used_at),
  }));
}

export async function deleteApiToken(db: SqlDriver, userId: Id, id: Id): Promise<boolean> {
  return (
    (await db.execute('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', [id, userId])) > 0
  );
}

/** The user id for a token hash, recording when it was last used. */
export async function userIdForTokenHash(db: SqlDriver, tokenHash: string): Promise<Id | null> {
  const [row] = await db.select<{ id: string; user_id: string; last_used_at: number | null }>(
    'SELECT id, user_id, last_used_at FROM api_tokens WHERE token_hash = ?',
    [tokenHash],
  );
  if (!row) return null;
  const at = now();
  if (!row.last_used_at || at - num(row.last_used_at) > 60_000) {
    await db.execute('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', [at, row.id]);
  }
  return row.user_id;
}
