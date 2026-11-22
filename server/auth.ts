import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { User } from '@/domain/models';
import type { SqlDriver } from '@/services/db/driver';
import * as users from '@/services/repositories/users';
import { serverConfig } from './config';
import { serverDb } from './db';

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts: object,
) => Promise<Buffer>;

export const SESSION_COOKIE = 'iq_session';
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(
    password.normalize('NFKC'),
    Buffer.from(salt, 'base64'),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    },
  );
  return timingSafeEqual(actual, expected);
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 256) return 'Password is too long.';
  return null;
}

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9._@-]{2,64}$/.test(username)) {
    return 'Usernames are 2–64 characters: letters, numbers, dot, dash, underscore or @.';
  }
  if (username.toLowerCase() === users.LOCAL_USER_ID) return 'That username is reserved.';
  return null;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function isSecure(req: Request): boolean {
  const app = serverConfig().APP_URL;
  if (app) return app.startsWith('https://');
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

export function cookieHeader(req: Request, name: string, value: string, maxAgeSec: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

export async function startSession(req: Request, userId: string): Promise<string> {
  const db = await serverDb();
  const token = randomBytes(32).toString('base64url');
  const ttlMs = serverConfig().SESSION_TTL_HOURS * 3_600_000;
  await users.createAuthSession(db, sha256(token), userId, ttlMs);
  await users.markLogin(db, userId);
  if (Math.random() < 0.05) await users.purgeExpiredAuthSessions(db);
  return cookieHeader(req, SESSION_COOKIE, token, Math.floor(ttlMs / 1000));
}

export async function endSession(req: Request): Promise<string> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await users.deleteAuthSession(await serverDb(), sha256(token));
  return cookieHeader(req, SESSION_COOKIE, '', 0);
}

async function proxyUser(db: SqlDriver, req: Request): Promise<User | null> {
  const c = serverConfig();
  const subject = req.headers.get(c.PROXY_USER_HEADER)?.trim();
  if (!subject) return null;
  const existing = await users.findUserByExternalId(db, 'proxy', subject);
  if (existing) return existing;
  const email = req.headers.get(c.PROXY_EMAIL_HEADER)?.trim() || null;
  const name = req.headers.get(c.PROXY_NAME_HEADER)?.trim() || subject;
  const first = (await users.countUsers(db)) === 0;
  const id = await provisionUser(db, {
    username: name,
    email,
    provider: 'proxy',
    externalId: subject,
    admin: first,
  });
  return users.getUser(db, id);
}

/** Create a user for an external identity, de-duplicating the username if needed. */
export async function provisionUser(
  db: SqlDriver,
  u: {
    username: string;
    displayName?: string;
    email: string | null;
    provider: string;
    externalId: string;
    admin: boolean;
  },
): Promise<string> {
  const base = u.username.replace(/[^a-zA-Z0-9._@-]/g, '').slice(0, 60) || 'user';
  for (let i = 0; i < 50; i++) {
    const username = i === 0 ? base : `${base}${i + 1}`;
    if (username.toLowerCase() === users.LOCAL_USER_ID) continue;
    if (await users.findUserForLogin(db, username)) continue;
    return users.createUser(db, {
      username,
      displayName: u.displayName ?? u.username,
      email: u.email,
      authProvider: u.provider,
      externalId: u.externalId,
      role: u.admin ? 'admin' : 'member',
    });
  }
  throw new Error('Could not allocate a username');
}

let bootstrapped = false;

/** Create the configured bootstrap admin once (local auth). */
async function bootstrapAdmin(db: SqlDriver) {
  if (bootstrapped) return;
  bootstrapped = true;
  const c = serverConfig();
  if (c.AUTH_MODE !== 'local' || !c.ADMIN_USERNAME || !c.ADMIN_PASSWORD) return;
  if (await users.findUserForLogin(db, c.ADMIN_USERNAME)) return;
  await users.createUser(db, {
    username: c.ADMIN_USERNAME,
    role: 'admin',
    passwordHash: await hashPassword(c.ADMIN_PASSWORD),
  });
}

/** The signed-in user for this request, or null. */
export async function currentUser(req: Request): Promise<User | null> {
  const db = await serverDb();
  const mode = serverConfig().AUTH_MODE;
  if (mode === 'none') return users.getUser(db, users.LOCAL_USER_ID);
  if (mode === 'proxy') return proxyUser(db, req);
  await bootstrapAdmin(db);
  const token = readCookie(req, SESSION_COOKIE);
  return token ? users.userForSession(db, sha256(token)) : null;
}

/**
 * Reject cross-site state-changing requests. Browsers send Origin on POST;
 * it must match this server (or APP_URL behind a proxy).
 */
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  const allowed = new Set<string>([new URL(req.url).origin]);
  const app = serverConfig().APP_URL;
  if (app) allowed.add(new URL(app).origin);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) {
    const proto =
      req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
    allowed.add(`${proto}://${host}`);
  }
  return allowed.has(origin);
}

export { readCookie, sha256 };
