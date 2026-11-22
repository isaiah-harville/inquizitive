import { checkOrigin, startSession, verifyPassword } from '@/server/auth';
import { serverConfig } from '@/server/config';
import { serverDb } from '@/server/db';
import { errorResponse, json, readJson } from '@/server/http';
import { ApiError } from '@/services/api/core';
import { findUserForLogin } from '@/services/repositories/users';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (serverConfig().AUTH_MODE !== 'local')
      throw new ApiError('Password sign-in is not enabled', 400);
    if (!checkOrigin(req)) throw new ApiError('Cross-site request blocked', 403);
    const { username, password } = await readJson<{ username?: string; password?: string }>(
      req,
      10_000,
    );
    if (!username || !password) throw new ApiError('Enter your username and password', 400);
    const user = await findUserForLogin(await serverDb(), username);
    // Always run the hash so response time doesn't reveal which usernames exist.
    const ok = await verifyPassword(
      password,
      user?.passwordHash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA',
    );
    if (!user || !ok) throw new ApiError('Incorrect username or password', 401);
    const cookie = await startSession(req, user.id);
    return json({ ok: true }, { headers: { 'set-cookie': cookie } });
  } catch (e) {
    return errorResponse(e);
  }
}
