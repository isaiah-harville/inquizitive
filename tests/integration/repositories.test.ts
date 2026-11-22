import { beforeEach, describe, expect, it } from 'vitest';
import { ReviewRating } from '@/domain/models';
import { createScheduler } from '@/domain/scheduling/fsrs';
import type { ScriptableDriver } from '@/services/db/driver';
import { LATEST_SCHEMA_VERSION, migrate, schemaVersion } from '@/services/db/migrate';
import * as cards from '@/services/repositories/cards';
import * as folders from '@/services/repositories/folders';
import * as progress from '@/services/repositories/progress';
import { search } from '@/services/repositories/search';
import * as sessions from '@/services/repositories/sessions';
import * as sets from '@/services/repositories/sets';
import * as stats from '@/services/repositories/stats';
import * as users from '@/services/repositories/users';
import { createTestDb } from '../helpers/node-driver';

const ME = users.LOCAL_USER_ID;
let db: ScriptableDriver;

beforeEach(async () => {
  db = await createTestDb();
});

async function makeSet(title = 'Spanish', n = 3, owner = ME) {
  const id = await sets.createSet(db, owner, {
    title,
    description: 'basics',
    tags: ['Language', 'language', ' A1 '],
  });
  await cards.insertCards(
    db,
    id,
    Array.from({ length: n }, (_, i) => ({
      front: `word ${i}`,
      back: `palabra ${i}`,
      acceptedAnswers: [`alt ${i}`],
    })),
  );
  return id;
}

describe('migrations', () => {
  it('applies once and reports the version', async () => {
    expect(await schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    expect(await migrate(db)).toBe(LATEST_SCHEMA_VERSION);
  });
});

describe('sets', () => {
  it('creates sets with normalized, de-duplicated tags and counts', async () => {
    const id = await makeSet();
    const [s] = await sets.listSets(db, ME);
    expect(s).toMatchObject({
      id,
      title: 'Spanish',
      cardCount: 3,
      learnedCount: 0,
      tags: ['A1', 'Language'],
    });
    expect(await sets.listTags(db, ME)).toEqual([
      { name: 'A1', count: 1 },
      { name: 'Language', count: 1 },
    ]);
  });

  it('filters by folder, archive state and tag; sorts by title', async () => {
    const f = await folders.createFolder(db, ME, 'School');
    const a = await sets.createSet(db, ME, { title: 'b set', folderId: f });
    const b = await sets.createSet(db, ME, { title: 'A set', tags: ['x'] });
    await sets.archiveSet(db, a, true);
    expect((await sets.listSets(db, ME, { folderId: f })).map((s) => s.id)).toEqual([]);
    expect(
      (await sets.listSets(db, ME, { folderId: f, archived: 'include' })).map((s) => s.id),
    ).toEqual([a]);
    expect((await sets.listSets(db, ME, { tag: 'X' })).map((s) => s.id)).toEqual([b]);
    expect(
      (await sets.listSets(db, ME, { archived: 'include', sort: 'title' })).map((s) => s.title),
    ).toEqual(['A set', 'b set']);
    const [folder] = await folders.listFolders(db, ME);
    expect(folder.setCount).toBe(0); // archived sets don't count
  });

  it('trashes, restores and purges', async () => {
    const id = await makeSet();
    await sets.trashSet(db, id);
    expect(await sets.listSets(db, ME)).toHaveLength(0);
    expect((await sets.listTrash(db, ME)).map((s) => s.id)).toEqual([id]);
    await sets.restoreSet(db, id);
    expect(await sets.listSets(db, ME)).toHaveLength(1);
    await sets.purgeSets(db, [id]);
    expect(await db.select('SELECT * FROM flashcards')).toHaveLength(0);
    expect(await db.select('SELECT * FROM tags')).toHaveLength(0);
  });

  it('purges expired trash only', async () => {
    const old = await makeSet('old');
    const recent = await makeSet('recent');
    await db.execute('UPDATE study_sets SET deleted_at = ? WHERE id = ?', [
      Date.now() - 31 * 86_400_000,
      old,
    ]);
    await sets.trashSet(db, recent);
    expect(await sets.expiredTrash(db)).toEqual([old]);
  });

  it('duplicates a set with cards, answers and tags but no progress', async () => {
    const id = await makeSet();
    const [c] = await cards.listCards(db, id);
    await progress.setStarred(db, ME, c.id, true);
    const copy = await sets.duplicateSet(db, id, ME);
    const copied = await cards.listCards(db, copy);
    expect(copied.map((x) => x.front)).toEqual(['word 0', 'word 1', 'word 2']);
    expect(copied[0].acceptedAnswers).toEqual(['alt 0']);
    expect(Object.keys(await progress.getProgressForSet(db, ME, copy))).toHaveLength(0);
    expect((await sets.getSetSummary(db, ME, copy))?.title).toBe('Spanish (copy)');
  });

  it('separates my sets from sets shared by others', async () => {
    const other = await users.createUser(db, { username: 'teacher' });
    const shared = await sets.createSet(db, other, { title: 'Shared', visibility: 'shared' });
    await sets.createSet(db, other, { title: 'Private' });
    await makeSet();
    expect((await sets.listSets(db, ME, { scope: 'shared' })).map((s) => s.id)).toEqual([shared]);
    expect((await sets.listSets(db, ME, { scope: 'mine' })).map((s) => s.title)).toEqual([
      'Spanish',
    ]);
    expect((await sets.listSets(db, ME, { scope: 'shared' }))[0].ownerName).toBe('teacher');
  });
});

describe('cards', () => {
  it('inserts after a given card, reorders, duplicates, deletes', async () => {
    const id = await makeSet('s', 2);
    const [first] = await cards.listCards(db, id);
    await cards.createCard(db, id, { front: 'between', back: 'x' }, first.id);
    expect((await cards.listCards(db, id)).map((c) => c.front)).toEqual([
      'word 0',
      'between',
      'word 1',
    ]);

    const list = await cards.listCards(db, id);
    await cards.reorderCards(db, id, [list[2].id, list[0].id, list[1].id]);
    expect((await cards.listCards(db, id)).map((c) => c.front)).toEqual([
      'word 1',
      'word 0',
      'between',
    ]);

    await cards.duplicateCard(db, list[0].id);
    expect((await cards.listCards(db, id)).map((c) => c.front)).toEqual([
      'word 1',
      'word 0',
      'word 0',
      'between',
    ]);

    await cards.deleteCards(db, [list[0].id, list[1].id]);
    expect(await cards.listCards(db, id)).toHaveLength(2);
  });

  it('updates content and accepted answers (deduplicated, ordered)', async () => {
    const id = await makeSet('s', 1);
    const [c] = await cards.listCards(db, id);
    await cards.updateCard(db, c.id, { back: 'new', acceptedAnswers: ['b', ' a ', 'B', ''] });
    const [u] = await cards.listCards(db, id);
    expect(u.back).toBe('new');
    expect(u.acceptedAnswers).toEqual(['b', 'a']);
  });

  it('handles a 1,000-card set', async () => {
    const id = await sets.createSet(db, ME, { title: 'big' });
    await cards.insertCards(
      db,
      id,
      Array.from({ length: 1000 }, (_, i) => ({ front: `f${i}`, back: `b${i}` })),
    );
    expect(await cards.listCards(db, id)).toHaveLength(1000);
    expect((await sets.getSetSummary(db, ME, id))?.cardCount).toBe(1000);
  });
});

describe('progress and spaced repetition', () => {
  const scheduler = createScheduler({ enableFuzz: false });

  it('stores stars and known marks per user', async () => {
    const id = await makeSet();
    const [a, b] = await cards.listCards(db, id);
    const other = await users.createUser(db, { username: 'classmate' });
    await progress.setStarred(db, ME, a.id, true);
    await progress.setKnown(db, ME, [a.id, b.id], true);
    const mine = await progress.getProgressForSet(db, ME, id);
    expect(mine[a.id]).toMatchObject({ starred: true, known: true });
    expect(await progress.getProgressForSet(db, other, id)).toEqual({});
    expect((await sets.getSetSummary(db, ME, id))?.learnedCount).toBe(2);
  });

  it('records reviews, schedules the next one and appends history', async () => {
    const id = await makeSet();
    const [a] = await cards.listCards(db, id);
    const t0 = Date.UTC(2026, 0, 1);
    const r1 = await progress.recordReview(db, scheduler, ME, a.id, ReviewRating.Easy, {
      at: t0,
      responseTimeMs: 1200,
    });
    expect(r1.intervalDays).toBeGreaterThanOrEqual(1);
    expect(await progress.reviewQueue(db, ME, { at: t0 })).toHaveLength(0);
    const due = await progress.reviewQueue(db, ME, { at: r1.card.due });
    expect(due.map((d) => d.card.id)).toEqual([a.id]);
    await progress.recordReview(db, scheduler, ME, a.id, ReviewRating.Again, { at: r1.card.due });
    const p = (await progress.getProgressForSet(db, ME, id))[a.id];
    expect(p).toMatchObject({ reviewCount: 2, lapses: 1 });
    expect(await db.select('SELECT * FROM review_events')).toHaveLength(2);
  });

  it("adds new cards to a set's review queue when asked", async () => {
    const id = await makeSet('s', 5);
    const q = await progress.reviewQueue(db, ME, { setId: id, newLimit: 3 });
    expect(q).toHaveLength(3);
    expect(q.every((i) => i.scheduling === null)).toBe(true);
  });

  it('counts due cards now and today', async () => {
    const id = await makeSet();
    const [a, b] = await cards.listCards(db, id);
    const t = Date.now();
    await progress.recordReview(db, scheduler, ME, a.id, ReviewRating.Again, { at: t - 3_600_000 });
    await progress.recordReview(db, scheduler, ME, b.id, ReviewRating.Easy, { at: t });
    const counts = await progress.dueCounts(db, ME, t, t + 3_600_000);
    expect(counts).toEqual({ dueNow: 1, dueToday: 1 });
  });
});

describe('sessions', () => {
  it('creates, saves with attempts, resumes and completes', async () => {
    const id = await makeSet();
    const [a] = await cards.listCards(db, id);
    const sid = await sessions.createSession(db, ME, id, 'learn', { step: 0 });
    await sessions.saveSession(
      db,
      ME,
      sid,
      { step: 1 },
      {
        attempts: [{ flashcardId: a.id, questionType: 'written', response: 'x', correct: false }],
      },
    );
    const active = await sessions.findActiveSession<{ step: number }>(db, ME, id, 'learn');
    expect(active?.state).toEqual({ step: 1 });
    expect((await sessions.resumableSessions(db, ME)).map((s) => s.id)).toEqual([sid]);
    await sessions.saveSession(db, ME, sid, { step: 2 }, { completed: true });
    expect(await sessions.findActiveSession(db, ME, id, 'learn')).toBeNull();
    expect((await stats.accuracyBySet(db, ME))[0]).toMatchObject({ correct: 0, total: 1 });
    expect((await sets.listSets(db, ME, { scope: 'studied' })).map((s) => s.id)).toEqual([id]);
  });

  it("refuses to write another user's session", async () => {
    const id = await makeSet();
    const [a] = await cards.listCards(db, id);
    const other = await users.createUser(db, { username: 'mallory' });
    const sid = await sessions.createSession(db, ME, id, 'learn', { step: 0 });
    await sessions.saveSession(
      db,
      other,
      sid,
      { step: 99 },
      {
        attempts: [{ flashcardId: a.id, questionType: 'written', response: 'x', correct: true }],
      },
    );
    expect(
      (await sessions.findActiveSession<{ step: number }>(db, ME, id, 'learn'))?.state.step,
    ).toBe(0);
    expect(await db.select('SELECT * FROM study_attempts')).toHaveLength(0);
  });

  it('tracks personal best match times', async () => {
    const id = await makeSet();
    expect(await sessions.recordMatchTime(db, ME, id, 6, 20_000)).toEqual({
      previousBest: null,
      isBest: true,
    });
    expect(await sessions.recordMatchTime(db, ME, id, 6, 25_000)).toEqual({
      previousBest: 20_000,
      isBest: false,
    });
    expect(await sessions.bestMatchTime(db, ME, id, 6)).toBe(20_000);
    expect(await sessions.bestMatchTime(db, ME, id, 8)).toBeNull();
  });
});

describe('search', () => {
  it('finds sets by title/tag and cards by content, prefix-matching', async () => {
    const id = await makeSet('Spanish verbs');
    await cards.insertCards(db, id, [{ front: 'correr', back: 'to run' }]);
    const r = await search(db, ME, 'spani');
    expect(r.sets.map((s) => s.id)).toEqual([id]);
    expect((await search(db, ME, 'languag')).sets).toHaveLength(1);
    expect((await search(db, ME, 'run')).cards.map((c) => c.front)).toEqual(['correr']);
  });

  it("is safe against FTS syntax and hides others' private sets", async () => {
    await makeSet();
    expect(await search(db, ME, '" OR * NEAR(')).toEqual({ sets: [], cards: [] });
    const other = await users.createUser(db, { username: 'x' });
    await sets.createSet(db, other, { title: 'Secret notes' });
    expect((await search(db, ME, 'secret')).sets).toHaveLength(0);
  });
});

describe('users and auth sessions', () => {
  it('looks up users case-insensitively and expires sessions', async () => {
    const id = await users.createUser(db, { username: 'Ada', passwordHash: 'h' });
    expect((await users.findUserForLogin(db, 'ada'))?.id).toBe(id);
    expect(await users.findUserForLogin(db, 'local')).toBeNull();
    await users.createAuthSession(db, 'tok', id, 60_000);
    expect((await users.userForSession(db, 'tok'))?.id).toBe(id);
    await users.setUserDisabled(db, id, true);
    expect(await users.userForSession(db, 'tok')).toBeNull();
  });

  it('rejects duplicate usernames regardless of case', async () => {
    await users.createUser(db, { username: 'sam' });
    await expect(users.createUser(db, { username: 'SAM' })).rejects.toThrow();
  });

  it('stores per-user settings', async () => {
    await users.setSetting(db, ME, 'theme', { mode: 'dark' });
    await users.setSetting(db, ME, 'theme', { mode: 'light' });
    expect(await users.getSettings(db, ME)).toEqual({ theme: { mode: 'light' } });
  });
});
