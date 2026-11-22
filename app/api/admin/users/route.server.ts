import { hashPassword, validatePassword, validateUsername } from '@/server/auth';
import { serverDb } from '@/server/db';
import { json, readJson, withUser } from '@/server/http';
import { ApiError } from '@/services/api/core';
import { createUser, findUserForLogin, updateUserProfile } from '@/services/repositories/users';

export const dynamic = 'force-dynamic';

/** Admin: create a local account, or reset a password. */
export async function POST(req: Request) {
  return withUser(req, async (admin) => {
    if (admin.role !== 'admin') throw new ApiError('Admins only', 403);
    const body = await readJson<{
      userId?: string;
      username?: string;
      password?: string;
      displayName?: string;
      role?: 'admin' | 'member';
    }>(req, 10_000);
    const pwProblem = validatePassword(body.password ?? '');
    if (pwProblem) throw new ApiError(pwProblem, 400);
    const db = await serverDb();
    const hash = await hashPassword(body.password as string);
    if (body.userId) {
      await updateUserProfile(db, body.userId, { passwordHash: hash });
      return json({ ok: true });
    }
    const username = (body.username ?? '').trim();
    const problem = validateUsername(username);
    if (problem) throw new ApiError(problem, 400);
    if (await findUserForLogin(db, username)) throw new ApiError('That username is taken', 409);
    const id = await createUser(db, {
      username,
      displayName: body.displayName,
      passwordHash: hash,
      role: body.role === 'admin' ? 'admin' : 'member',
    });
    return json({ id });
  });
}
