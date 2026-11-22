import type { Manifest } from '@/domain/sync';
import type { SyncTransport } from './engine';
import type { ApplyResponse } from './rows';

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/** Talks to an Inquizitive server's /api/sync and /api/media with a device token. */
export function createHttpTransport(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch,
): SyncTransport {
  const base = normalizeServerUrl(baseUrl);
  const auth = { authorization: `Bearer ${token}` };

  async function call(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: { ...auth, ...(init.headers ?? {}) },
      });
    } catch (e) {
      throw new SyncError(
        `Can't reach ${base}: ${e instanceof Error ? e.message : e}. Check the address and your connection.`,
      );
    }
    if (res.status === 401) {
      throw new SyncError(
        "The server didn't accept this sync token. Create a new one in the server's Settings → Desktop sync.",
      );
    }
    if (!res.ok && res.status !== 404) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new SyncError(
        `Sync failed on the server (${res.status}): ${body.error ?? res.statusText}`,
      );
    }
    return res;
  }

  async function post<T>(body: unknown): Promise<T> {
    const res = await call('/api/sync/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 404) throw new SyncError(`${base} doesn't look like an Inquizitive server.`);
    return (await res.json()) as T;
  }

  return {
    manifest: () => post<Manifest>({ op: 'manifest' }),
    apply: (req) => post<ApplyResponse>(req),
    async uploadMedia(name, bytes) {
      await call(`/api/media/?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        body: bytes as BodyInit,
      });
    },
    async downloadMedia(name) {
      const res = await call(`/api/media/?name=${encodeURIComponent(name)}`, { method: 'GET' });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
  };
}
