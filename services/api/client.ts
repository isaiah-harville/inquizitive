import type { User } from '@/domain/models';
import { getDb } from '@/services/db';
import { isTauri } from '@/services/db/tauri-driver';
import type { ApiMethod, CoreApi } from './core';

export type Backend = 'desktop' | 'browser' | 'server';

export type Api = {
  [K in ApiMethod]: (...args: Parameters<CoreApi[K]>) => Promise<Awaited<ReturnType<CoreApi[K]>>>;
};

export function backend(): Backend {
  if (isTauri()) return 'desktop';
  return process.env.NEXT_PUBLIC_BACKEND === 'browser' ? 'browser' : 'server';
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function rpc(method: string, args: unknown[]): Promise<unknown> {
  // JSON would turn trailing `undefined`s into nulls; drop them instead.
  const trimmed = args.slice();
  while (trimmed.length && trimmed[trimmed.length - 1] === undefined) trimmed.pop();
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ method, args: trimmed }),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      window.location.assign('/login/');
    }
    throw new HttpError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return body.result;
}

/** Proxy keys that must not become RPC calls (`then` would make the proxy a thenable). */
function isRpcName(key: string | symbol): key is string {
  return typeof key === 'string' && key !== 'then' && !key.startsWith('$$') && key !== 'toJSON';
}

function httpApi(): Api {
  return new Proxy({} as Api, {
    get: (_t, method) =>
      isRpcName(method) ? (...args: unknown[]) => rpc(method, args) : undefined,
  });
}

let local: Promise<Api> | null = null;

async function localApi(): Promise<Api> {
  const [{ createCoreApi }, users, { deleteLocalMedia }] = await Promise.all([
    import('./core'),
    import('@/services/repositories/users'),
    import('@/services/platform'),
  ]);
  const db = await getDb();
  const user = (await users.getUser(db, users.LOCAL_USER_ID)) as User;
  const core = createCoreApi(db, user, { deleteMedia: deleteLocalMedia });
  return new Proxy({} as Api, {
    get: (_t, method) =>
      isRpcName(method) && method in core
        ? async (...args: unknown[]) =>
            (core[method as ApiMethod] as (...a: unknown[]) => unknown)(...args)
        : undefined,
  });
}

/** The app's API for the current backend. */
export function getApi(): Promise<Api> {
  if (backend() === 'server') return Promise.resolve(httpApi());
  local ??= localApi();
  local.catch(() => {
    local = null;
  });
  return local;
}
