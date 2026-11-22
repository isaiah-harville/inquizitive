import { json, readJson, withUser } from '@/server/http';
import { dispatch, isApiMethod } from '@/server/rpc';
import { ApiError } from '@/services/api/core';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await readJson<{ method?: unknown; args?: unknown }>(req);
    if (!isApiMethod(body.method)) throw new ApiError('Unknown method', 400);
    return json({ result: await dispatch(user, body.method, body.args ?? []) });
  });
}
