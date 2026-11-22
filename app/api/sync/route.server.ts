import { ZodError } from 'zod';
import { serverDb } from '@/server/db';
import { json, readJson, withUser } from '@/server/http';
import { ApiError } from '@/services/api/core';
import { handleSyncRequest } from '@/services/sync/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return withUser(req, async (user) => {
    const body = await readJson(req, 200 * 1024 * 1024);
    try {
      return json(await handleSyncRequest(await serverDb(), user.id, body));
    } catch (e) {
      if (e instanceof ZodError) {
        const issue = e.issues[0];
        throw new ApiError(`Invalid sync request: ${issue.path.join('.')} ${issue.message}`, 400);
      }
      throw e;
    }
  });
}
