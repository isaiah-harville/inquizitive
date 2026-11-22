import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@/domain/models';
import { ApiError, type CoreApi, createCoreApi } from '@/services/api/core';
import type { ScriptableDriver } from '@/services/db/driver';
import { BUNDLE_VERSION, parseBundle } from '@/services/import-export/bundle';
import * as users from '@/services/repositories/users';
import { createTestDb } from '../helpers/node-driver';

let db: ScriptableDriver;
let teacher: CoreApi;
let student: CoreApi;
let admin: CoreApi;

async function userApi(username: string, role: 'admin' | 'member' = 'member') {
  const id = await users.createUser(db, { username, role });
  const user = (await users.getUser(db, id)) as User;
  return createCoreApi(db, user);
}

beforeEach(async () => {
  db = await createTestDb();
  teacher = await userApi('teacher');
  student = await userApi('student');
  admin = await userApi('admin', 'admin');
});

async function expectStatus(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toBeInstanceOf(ApiError);
  await p.catch((e: ApiError) => expect(e.status).toBe(status));
}

describe('authorization', () => {
  it('hides private sets from other users', async () => {
    const id = await teacher.createSet({ title: 'Private' });
    await expectStatus(student.getSet(id), 404);
    expect(await student.listSets({ scope: 'shared' })).toHaveLength(0);
    expect((await student.search('private')).sets).toHaveLength(0);
  });

  it('lets everyone study a shared set but only the owner edit it', async () => {
    const id = await teacher.createSet({ title: 'Biology 101', visibility: 'shared' });
    const [cardId] = await teacher.insertCards(id, [{ front: 'cell', back: 'unit of life' }]);
    const view = await student.getSet(id);
    expect(view.canEdit).toBe(false);
    expect(view.cards).toHaveLength(1);
    await expectStatus(student.updateSet(id, { title: 'hacked' }), 403);
    await expectStatus(student.updateCard(cardId, { back: 'hacked' }), 403);
    await expectStatus(student.deleteCards([cardId]), 403);
    await expectStatus(student.trashSet(id), 403);
    // Studying writes only the student's own progress.
    await student.setStarred(cardId, true);
    await student.recordReview(cardId, 3);
    expect((await student.getSet(id)).progress[cardId].starred).toBe(true);
    expect((await teacher.getSet(id)).progress[cardId]).toBeUndefined();
  });

  it("copies a shared set into the student's own library", async () => {
    const id = await teacher.createSet({ title: 'Shared', visibility: 'shared' });
    await teacher.insertCards(id, [{ front: 'a', back: 'b' }]);
    const copy = await student.duplicateSet(id);
    const mine = await student.getSet(copy);
    expect(mine.canEdit).toBe(true);
    expect(mine.set.title).toBe('Shared');
    expect(mine.cards.map((c) => c.front)).toEqual(['a']);
  });

  it("does not let a user file sets into someone else's folder", async () => {
    const folder = await teacher.createFolder('Mine');
    await expectStatus(student.createSet({ title: 'x', folderId: folder }), 404);
    await expectStatus(student.deleteFolder(folder), 404);
  });

  it('restricts administration to admins', async () => {
    await expectStatus(student.listUsers(), 403);
    expect((await admin.listUsers()).map((u) => u.username)).toEqual([
      'admin',
      'student',
      'teacher',
    ]);
  });

  it('lets admins moderate any set', async () => {
    const id = await teacher.createSet({ title: 'Spam' });
    await admin.trashSet(id);
    expect(await teacher.listSets()).toHaveLength(0);
  });

  it("refuses review/progress writes on cards the user can't see", async () => {
    const id = await teacher.createSet({ title: 'Private' });
    const [cardId] = await teacher.insertCards(id, [{ front: 'a', back: 'b' }]);
    await expectStatus(student.setStarred(cardId, true), 404);
    await expectStatus(student.recordReview(cardId, 3), 404);
  });
});

describe('export / restore', () => {
  it('round-trips a library with ids, folders, answers and progress', async () => {
    const folder = await teacher.createFolder('Science');
    const id = await teacher.createSet({ title: 'Chem', folderId: folder, tags: ['sci'] });
    const [c1] = await teacher.insertCards(id, [
      { front: 'H', back: 'Hydrogen', acceptedAnswers: ['hydrogen gas'], explanation: 'lightest' },
      { front: 'He', back: 'Helium' },
    ]);
    await teacher.recordReview(c1, 4);
    const bundle = await teacher.exportLibrary({ includeProgress: true });
    expect(bundle.version).toBe(BUNDLE_VERSION);
    const json = JSON.parse(JSON.stringify(bundle));

    // Restore into a fresh database: identical ids.
    db = await createTestDb();
    const restorer = await userApi('teacher');
    const report = await restorer.importLibrary(json, { includeProgress: true });
    expect(report).toMatchObject({
      setsImported: 1,
      cardsImported: 2,
      setsCopied: 0,
      foldersCreated: 1,
    });
    const restored = await restorer.getSet(id);
    expect(restored.set).toMatchObject({ title: 'Chem', tags: ['sci'] });
    expect(restored.cards[0]).toMatchObject({
      id: c1,
      acceptedAnswers: ['hydrogen gas'],
      explanation: 'lightest',
    });
    expect(restored.progress[c1].reviewCount).toBe(1);
    expect((await restorer.listFolders())[0].name).toBe('Science');

    // Importing again never overwrites: it adds copies with new ids.
    const again = await restorer.importLibrary(json);
    expect(again.setsCopied).toBe(1);
    expect(await restorer.listSets()).toHaveLength(2);
  });

  it('rejects malformed and future-version files with a clear message', () => {
    expect(() => parseBundle({ hello: 'world' })).toThrow(/Not a valid Inquizitive library file/);
    expect(() =>
      parseBundle({ format: 'inquizitive.library', version: 99, exportedAt: 0, sets: [] }),
    ).toThrow(/newer version/);
    expect(() =>
      parseBundle({
        format: 'inquizitive.library',
        version: 1,
        exportedAt: 0,
        sets: [
          {
            id: 's',
            title: 't',
            cards: [
              {
                id: 'c',
                front: 'a',
                back: 'b',
                media: [{ side: 'front', path: '../../etc/passwd', mimeType: 'x' }],
              },
            ],
          },
        ],
      }),
    ).toThrow(/invalid media file name/);
  });
});
