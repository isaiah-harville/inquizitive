import {
  checkOrigin,
  hashPassword,
  startSession,
  validatePassword,
  validateUsername,
} from '@/server/auth';
import { serverConfig } from '@/server/config';
import { serverDb } from '@/server/db';
import { errorResponse, json, readJson } from '@/server/http';
import { ApiError } from '@/services/api/core';
import { countUsers, createUser, findUserForLogin } from '@/services/repositories/users';

export const dynamic = 'force-dynamic';

/** Self-service sign-up (when ALLOW_SIGNUP=true), or first-run admin setup when no users exist. */
export async function POST(req: Request) {
  try {
    const c = serverConfig();
    if (c.AUTH_MODE !== 'local') throw new ApiError('Sign-up is not available', 400);
    if (!checkOrigin(req)) throw new ApiError('Cross-site request blocked', 403);
    const db = await serverDb();
    const first = (await countUsers(db)) === 0;
    if (!first && !c.ALLOW_SIGNUP)
      throw new ApiError('Ask an administrator to create your account', 403);
    const body = await readJson<{ username?: string; password?: string; displayName?: string }>(
      req,
      10_000,
    );
    const username = (body.username ?? '').trim();
    const problem = validateUsername(username) ?? validatePassword(body.password ?? '');
    if (problem) throw new ApiError(problem, 400);
    if (await findUserForLogin(db, username)) throw new ApiError('That username is taken', 409);
    const id = await createUser(db, {
      username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password as string),
      role: first ? 'admin' : 'member',
    });
    const cookie = await startSession(req, id);
    return json({ ok: true, admin: first }, { headers: { 'set-cookie': cookie } });
  } catch (e) {
    return errorResponse(e);
  }
}
