import type { Id, Role, User } from '@/domain/models';
import { newId, now } from '@/lib/id';
import type { SqlDriver } from '@/services/db/driver';
import { stmt } from '@/services/db/driver';
import { num } from './sql';

/** The single owner of all data on the desktop app and in AUTH_MODE=none. */
export const LOCAL_USER_ID = 'local';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: Role;
  auth_provider: string;
  password_hash?: string | null;
  disabled_at?: number | null;
}

function mapUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.username,
    email: r.email,
    role: r.role,
    authProvider: r.auth_provider,
  };
}

export async function getUser(db: SqlDriver, id: Id): Promise<User | null> {
  const [row] = await db.select<UserRow>(
    'SELECT * FROM users WHERE id = ? AND disabled_at IS NULL',
    [id],
  );
  return row ? mapUser(row) : null;
}

export async function findUserForLogin(
  db: SqlDriver,
  username: string,
): Promise<(User & { passwordHash: string | null }) | null> {
  const [row] = await db.select<UserRow>(
    'SELECT * FROM users WHERE lower(username) = lower(?) AND disabled_at IS NULL AND id <> ?',
    [username.trim(), LOCAL_USER_ID],
  );
  return row ? { ...mapUser(row), passwordHash: row.password_hash ?? null } : null;
}

export async function findUserByExternalId(
  db: SqlDriver,
  provider: string,
  externalId: string,
): Promise<User | null> {
  const [row] = await db.select<UserRow>(
    'SELECT * FROM users WHERE auth_provider = ? AND external_id = ? AND disabled_at IS NULL',
    [provider, externalId],
  );
  return row ? mapUser(row) : null;
}

/** Real (non-local) accounts. */
export async function countUsers(db: SqlDriver): Promise<number> {
  const [row] = await db.select<{ n: number }>('SELECT count(*) AS n FROM users WHERE id <> ?', [
    LOCAL_USER_ID,
  ]);
  return num(row?.n);
}

export interface NewUser {
  username: string;
  displayName?: string;
  email?: string | null;
  role?: Role;
  passwordHash?: string | null;
  authProvider?: string;
  externalId?: string | null;
}

export async function createUser(db: SqlDriver, u: NewUser): Promise<Id> {
  const id = newId();
  const at = now();
  await db.execute(
    `INSERT INTO users (id, username, display_name, email, role, password_hash, auth_provider, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      u.username.trim(),
      u.displayName?.trim() ?? '',
      u.email ?? null,
      u.role ?? 'member',
      u.passwordHash ?? null,
      u.authProvider ?? 'local',
      u.externalId ?? null,
      at,
      at,
    ],
  );
  return id;
}

export async function updateUserProfile(
  db: SqlDriver,
  id: Id,
  patch: { displayName?: string; email?: string | null; role?: Role; passwordHash?: string },
): Promise<void> {
  const cols: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.displayName !== undefined) {
    cols.push('display_name = ?');
    params.push(patch.displayName.trim());
  }
  if (patch.email !== undefined) {
    cols.push('email = ?');
    params.push(patch.email);
  }
  if (patch.role !== undefined) {
    cols.push('role = ?');
    params.push(patch.role);
  }
  if (patch.passwordHash !== undefined) {
    cols.push('password_hash = ?');
    params.push(patch.passwordHash);
  }
  if (cols.length === 0) return;
  cols.push('updated_at = ?');
  params.push(now(), id);
  await db.execute(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`, params);
}

export async function listUsers(
  db: SqlDriver,
): Promise<(User & { disabled: boolean; lastLoginAt: number | null })[]> {
  const rows = await db.select<UserRow & { last_login_at: number | null }>(
    'SELECT * FROM users WHERE id <> ? ORDER BY lower(username)',
    [LOCAL_USER_ID],
  );
  return rows.map((r) => ({
    ...mapUser(r),
    disabled: r.disabled_at !== null && r.disabled_at !== undefined,
    lastLoginAt: r.last_login_at === null ? null : num(r.last_login_at),
  }));
}

export async function setUserDisabled(db: SqlDriver, id: Id, disabled: boolean): Promise<void> {
  await db.batch([
    stmt(
      'UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?',
      disabled ? now() : null,
      now(),
      id,
    ),
    ...(disabled ? [stmt('DELETE FROM auth_sessions WHERE user_id = ?', id)] : []),
  ]);
}

export async function markLogin(db: SqlDriver, id: Id): Promise<void> {
  await db.execute('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), id]);
}

export async function createAuthSession(
  db: SqlDriver,
  tokenHash: string,
  userId: Id,
  ttlMs: number,
): Promise<void> {
  const at = now();
  await db.execute(
    'INSERT INTO auth_sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    [tokenHash, userId, at, at + ttlMs, at],
  );
}

export async function userForSession(db: SqlDriver, tokenHash: string): Promise<User | null> {
  const [row] = await db.select<UserRow & { expires_at: number }>(
    `SELECT u.*, s.expires_at FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ? AND u.disabled_at IS NULL`,
    [tokenHash, now()],
  );
  return row ? mapUser(row) : null;
}

export async function deleteAuthSession(db: SqlDriver, tokenHash: string): Promise<void> {
  await db.execute('DELETE FROM auth_sessions WHERE id = ?', [tokenHash]);
}

export async function purgeExpiredAuthSessions(db: SqlDriver): Promise<void> {
  await db.execute('DELETE FROM auth_sessions WHERE expires_at <= ?', [now()]);
}

export async function getSettings(db: SqlDriver, userId: Id): Promise<Record<string, unknown>> {
  const rows = await db.select<{ key: string; value: string }>(
    'SELECT key, value FROM user_settings WHERE user_id = ?',
    [userId],
  );
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // ignore corrupt values; defaults apply
    }
  }
  return out;
}

export async function setSetting(
  db: SqlDriver,
  userId: Id,
  key: string,
  value: unknown,
): Promise<void> {
  await db.execute(
    `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
    [userId, key, JSON.stringify(value)],
  );
}
