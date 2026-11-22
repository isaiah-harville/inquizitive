import { beforeEach, describe, expect, it } from 'vitest';
import { ReviewRating } from '@/domain/models';
import { createScheduler } from '@/domain/scheduling/fsrs';
import type { Manifest } from '@/domain/sync';
import type { ScriptableDriver } from '@/services/db/driver';
import { migrate } from '@/services/db/migrate';
import * as cards from '@/services/repositories/cards';
import * as folders from '@/services/repositories/folders';
import * as progress from '@/services/repositories/progress';
import * as sets from '@/services/repositories/sets';
import * as users from '@/services/repositories/users';
import {
  handleSyncRequest,
  type MediaStore,
  runSync,
  type SyncTransport,
} from '@/services/sync/engine';
import type { ApplyResponse } from '@/services/sync/rows';
import { createNodeDriver, createTestDb } from '../helpers/node-driver';

const LOCAL = users.LOCAL_USER_ID;
let desktop: ScriptableDriver;
let server: ScriptableDriver;
let alice: string;
let serverFiles: Map<string, Uint8Array>;
let desktopFiles: Map<string, Uint8Array>;
let clock: number;

function memoryMedia(files: Map<string, Uint8Array>): MediaStore {
  return { read: async (n) => files.get(n) ?? null, write: async (n, b) => void files.set(n, b) };
}

function transport(userId: () => string): SyncTransport {
  return {
    manifest: async () =>
      (await handleSyncRequest(server, userId(), { op: 'manifest' })) as Manifest,
    apply: async (req) =>
      JSON.parse(JSON.stringify(await handleSyncRequest(server, userId(), req))) as ApplyResponse,
    uploadMedia: async (n, b) => void (serverFiles.has(n) || serverFiles.set(n, b)),
    downloadMedia: async (n) => serverFiles.get(n) ?? null,
  };
}

const sync = () =>
  runSync(
    desktop,
    LOCAL,
    transport(() => alice),
    memoryMedia(desktopFiles),
  );

async function titles(db: ScriptableDriver, owner: string) {
  return (await sets.listSets(db, owner, { archived: 'include' })).map((s) => s.title).sort();
}

beforeEach(async () => {
  desktop = createNodeDriver();
  await migrate(desktop);
  server = await createTestDb();
  alice = await users.createUser(server, { username: 'alice' });
  serverFiles = new Map();
  desktopFiles = new Map();
  clock = Date.now();
});

async function desktopSet(title = 'Spanish') {
  const folder = await folders.createFolder(desktop, LOCAL, 'Languages');
  const id = await sets.createSet(desktop, LOCAL, { title, folderId: folder, tags: ['es'] });
  const [c1] = await cards.insertCards(desktop, id, [
    { front: 'hola', back: 'hello', acceptedAnswers: ['hi'] },
    { front: 'adiós', back: 'goodbye' },
  ]);
  desktopFiles.set('0a1b.png', new Uint8Array([137, 80, 78, 71]));
  await cards.addCardMedia(desktop, c1, 'front', '0a1b.png', 'image/png');
  await progress.setStarred(desktop, LOCAL, c1, true);
  await progress.recordReview(
    desktop,
    createScheduler({ enableFuzz: false }),
    LOCAL,
    c1,
    ReviewRating.Good,
  );
  return { id, c1 };
}

describe('desktop to server sync', () => {
  it('first sync copies the whole desktop library into the server account', async () => {
    const { id, c1 } = await desktopSet();
    const report = await sync();
    expect(report.pushed).toBeGreaterThan(0);
    const onServer = await sets.getSetSummary(server, alice, id);
    expect(onServer).toMatchObject({
      title: 'Spanish',
      ownerId: alice,
      cardCount: 2,
      tags: ['es'],
    });
    expect((await folders.listFolders(server, alice)).map((f) => f.name)).toEqual(['Languages']);
    const serverCards = await cards.listCards(server, id);
    expect(serverCards[0]).toMatchObject({ id: c1, acceptedAnswers: ['hi'] });
    expect(serverCards[0].media[0].relativePath).toBe('0a1b.png');
    expect(serverFiles.has('0a1b.png')).toBe(true);
    const p = await progress.getProgressForSet(server, alice, id);
    expect(p[c1]).toMatchObject({ starred: true, reviewCount: 1 });
    expect(
      await server.select('SELECT id FROM review_events WHERE user_id = ?', [alice]),
    ).toHaveLength(1);
  });

  it('a second sync with no changes moves nothing', async () => {
    await desktopSet();
    await sync();
    const again = await sync();
    expect(again).toMatchObject({ pushed: 0, pulled: 0, deletedHere: 0, deletedThere: 0 });
  });

  it('pulls edits and new sets made on the server, including images', async () => {
    const { id, c1 } = await desktopSet();
    await sync();
    await new Promise((r) => setTimeout(r, 5));
    await cards.updateCard(server, c1, { back: 'hello (edited on the web)' });
    const webSet = await sets.createSet(server, alice, { title: 'Made on the web' });
    await cards.insertCards(server, webSet, [{ front: 'a', back: 'b' }]);
    const [webCard] = await cards.listCards(server, webSet);
    serverFiles.set('ffff.webp', new Uint8Array([1, 2, 3]));
    await cards.addCardMedia(server, webCard.id, 'back', 'ffff.webp', 'image/webp');

    const report = await sync();
    expect(report.pulled).toBeGreaterThan(0);
    expect((await cards.listCards(desktop, id))[0].back).toBe('hello (edited on the web)');
    expect(await titles(desktop, LOCAL)).toEqual(['Made on the web', 'Spanish']);
    expect(desktopFiles.has('ffff.webp')).toBe(true);
  });

  it('the most recent edit wins when both sides changed', async () => {
    const { c1 } = await desktopSet();
    await sync();
    await cards.updateCard(server, c1, { front: 'server edit' });
    await new Promise((r) => setTimeout(r, 5));
    await cards.updateCard(desktop, c1, { front: 'desktop edit (later)' });
    await sync();
    const [serverCard] = await server.select<{ front: string }>(
      'SELECT front FROM flashcards WHERE id = ?',
      [c1],
    );
    expect(serverCard.front).toBe('desktop edit (later)');
  });

  it('propagates deletions both ways', async () => {
    const { id, c1 } = await desktopSet();
    const other = await sets.createSet(desktop, LOCAL, { title: 'Doomed' });
    await sync();

    await cards.deleteCards(desktop, [c1]);
    await sets.purgeSets(server, [other]);
    const report = await sync();
    expect(report.deletedThere).toBe(1);
    expect(report.deletedHere).toBe(1);
    expect(await cards.listCards(server, id)).toHaveLength(1);
    expect(await titles(desktop, LOCAL)).toEqual(['Spanish']);
    expect(await sync()).toMatchObject({ pushed: 0, pulled: 0, deletedHere: 0, deletedThere: 0 });
  });

  it('an edit made after a deletion on the other side brings the row back', async () => {
    const { id } = await desktopSet();
    await sync();
    await sets.purgeSets(server, [id]);
    await new Promise((r) => setTimeout(r, 5));
    await sets.updateSet(desktop, id, { title: 'Still studying this' });
    await sync();
    expect(await titles(server, alice)).toEqual(['Still studying this']);
  });

  it('syncs trash and archive state', async () => {
    const { id } = await desktopSet();
    await sync();
    await sets.trashSet(desktop, id);
    await sync();
    expect((await sets.listTrash(server, alice)).map((s) => s.id)).toEqual([id]);
  });

  it("never takes over another user's set that happens to share an id", async () => {
    const { id } = await desktopSet();
    const bob = await users.createUser(server, { username: 'bob' });
    await server.execute(
      "INSERT INTO study_sets (id, owner_id, title, description, created_at, updated_at) VALUES (?, ?, 'Bob', '', 0, 0)",
      [id, bob],
    );
    const report = await sync();
    expect(report.skipped).toBeGreaterThan(0);
    expect(await titles(server, bob)).toEqual(['Bob']);
    expect(await titles(server, alice)).toEqual([]);
  });

  it('keeps each user separate: two desktops, two accounts', async () => {
    await desktopSet('Alice set');
    await sync();
    const bob = await users.createUser(server, { username: 'bob' });
    const bobDesktop = createNodeDriver();
    await migrate(bobDesktop);
    await sets.createSet(bobDesktop, LOCAL, { title: 'Bob set' });
    await runSync(
      bobDesktop,
      LOCAL,
      transport(() => bob),
      memoryMedia(new Map()),
    );
    expect(await titles(server, alice)).toEqual(['Alice set']);
    expect(await titles(server, bob)).toEqual(['Bob set']);
    expect(clock).toBeGreaterThan(0);
  });
});
