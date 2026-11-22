import type { User } from '@/domain/models';
import { ApiError } from '@/services/api/core';
import { checkOrigin, currentUser } from './auth';
import { serverConfig } from './config';

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data ?? null, {
    ...init,
    headers: { 'cache-control': 'no-store', ...(init.headers ?? {}) },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return json({ error: e.message }, { status: e.status });
  console.error('[inquizitive] request failed:', e);
  const message =
    e instanceof Error && serverConfig().NODE_ENV !== 'production'
      ? e.message
      : 'Something went wrong';
  return json({ error: message }, { status: 500 });
}

/** Run a handler for a signed-in user; state-changing methods also require a same-origin request. */
export async function withUser(
  req: Request,
  fn: (user: User) => Promise<Response>,
): Promise<Response> {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !checkOrigin(req)) {
      throw new ApiError('Cross-site request blocked', 403);
    }
    const user = await currentUser(req);
    if (!user) throw new ApiError('Please sign in', 401);
    return await fn(user);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function readJson<T = unknown>(req: Request, maxBytes = 60 * 1024 * 1024): Promise<T> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new ApiError('Request is too large', 400);
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError('Malformed JSON body', 400);
  }
}
