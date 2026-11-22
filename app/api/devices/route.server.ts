import { bearerToken, issueApiToken } from '@/server/auth';
import { serverDb } from '@/server/db';
import { json, readJson, withUser } from '@/server/http';
import { ApiError } from '@/services/api/core';
import { deleteApiToken, listApiTokens } from '@/services/repositories/tokens';

export const dynamic = 'force-dynamic';

function requireBrowserSession(req: Request) {
  if (bearerToken(req))
    throw new ApiError('Manage devices from the web app, not with a device token', 403);
}

export async function GET(req: Request) {
  return withUser(req, async (user) => {
    requireBrowserSession(req);
    return json({ devices: await listApiTokens(await serverDb(), user.id) });
  });
}

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    requireBrowserSession(req);
    const { name } = await readJson<{ name?: string }>(req, 10_000);
    return json(await issueApiToken(user.id, name ?? 'Desktop app'));
  });
}

export async function DELETE(req: Request) {
  return withUser(req, async (user) => {
    requireBrowserSession(req);
    const id = new URL(req.url).searchParams.get('id') ?? '';
    if (!(await deleteApiToken(await serverDb(), user.id, id)))
      throw new ApiError('Device not found', 404);
    return json({ ok: true });
  });
}
