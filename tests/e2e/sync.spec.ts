import { expect, test } from '@playwright/test';
import { migrate } from '@/services/db/migrate';
import * as cards from '@/services/repositories/cards';
import * as sets from '@/services/repositories/sets';
import { LOCAL_USER_ID } from '@/services/repositories/users';
import { runSync } from '@/services/sync/engine';
import { createHttpTransport } from '@/services/sync/http-transport';
import { createNodeDriver } from '../helpers/node-driver';

test('a desktop library syncs to the server over HTTP with a device token', async ({
  request,
  baseURL,
  page,
}) => {
  const created = await request.post('/api/devices/', { data: { name: 'E2E laptop' } });
  expect(created.ok()).toBe(true);
  const { token } = (await created.json()) as { token: string };
  expect(token).toMatch(/^iqz_/);

  const desktop = createNodeDriver();
  await migrate(desktop);
  const setId = await sets.createSet(desktop, LOCAL_USER_ID, { title: 'Synced from desktop' });
  const [cardId] = await cards.insertCards(desktop, setId, [{ front: 'sync', back: 'it works' }]);
  const files = new Map([
    ['0abc12.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2])],
  ]);
  await cards.addCardMedia(desktop, cardId, 'front', '0abc12.png', 'image/png');

  const transport = createHttpTransport(baseURL as string, token, fetch);
  const media = { read: async (n: string) => files.get(n) ?? null, write: async () => {} };
  const report = await runSync(desktop, LOCAL_USER_ID, transport, media);
  expect(report.pushed).toBeGreaterThan(0);
  expect(report.missingMedia).toEqual([]);

  await page.goto(`/set/?id=${setId}`);
  await expect(page.getByRole('heading', { name: 'Synced from desktop' })).toBeVisible();
  await expect(page.getByText('it works').first()).toBeVisible();
  expect((await request.get('/api/media/?name=0abc12.png')).ok()).toBe(true);

  const bad = createHttpTransport(baseURL as string, 'iqz_not-a-real-token', fetch);
  await expect(bad.manifest()).rejects.toThrow(/didn't accept this sync token/);
});
