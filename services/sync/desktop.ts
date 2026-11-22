import { z } from 'zod';
import { getApi } from '@/services/api/client';
import { getDb } from '@/services/db';
import { readMediaBytes, writeLocalMedia } from '@/services/platform';
import { LOCAL_USER_ID } from '@/services/repositories/users';
import { runSync, type SyncReport } from './engine';
import { createHttpTransport, normalizeServerUrl } from './http-transport';

const SETTINGS_KEY = 'sync';

const syncSettings = z.object({
  serverUrl: z.string(),
  token: z.string(),
  lastSyncAt: z.number().nullable(),
  lastError: z.string().nullable(),
});

export type SyncSettings = z.infer<typeof syncSettings>;

async function tauriFetch(): Promise<typeof fetch> {
  const { fetch } = await import('@tauri-apps/plugin-http');
  return fetch as typeof globalThis.fetch;
}

export async function loadSyncSettings(): Promise<SyncSettings | null> {
  const all = await (await getApi()).getSettings();
  const parsed = syncSettings.safeParse(all[SETTINGS_KEY]);
  return parsed.success ? parsed.data : null;
}

async function save(settings: SyncSettings | null) {
  await (await getApi()).setSetting(SETTINGS_KEY, settings);
}

/** Check the server and token work, then remember them. */
export async function connectToServer(serverUrl: string, token: string): Promise<SyncSettings> {
  const url = normalizeServerUrl(serverUrl);
  await createHttpTransport(url, token.trim(), await tauriFetch()).manifest();
  const settings: SyncSettings = {
    serverUrl: url,
    token: token.trim(),
    lastSyncAt: null,
    lastError: null,
  };
  await save(settings);
  return settings;
}

export async function disconnectFromServer(): Promise<void> {
  await save(null);
}

export async function syncNow(): Promise<SyncReport> {
  const settings = await loadSyncSettings();
  if (!settings) throw new Error('Connect to a server first.');
  try {
    const report = await runSync(
      await getDb(),
      LOCAL_USER_ID,
      createHttpTransport(settings.serverUrl, settings.token, await tauriFetch()),
      { read: readMediaBytes, write: writeLocalMedia },
    );
    await save({ ...settings, lastSyncAt: report.at, lastError: null });
    return report;
  } catch (e) {
    await save({ ...settings, lastError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
