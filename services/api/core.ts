import type {
  CardProgress,
  Flashcard,
  Id,
  ReviewRating,
  StudyMode,
  StudySession,
  StudySetSummary,
  User,
} from '@/domain/models';
import { createScheduler } from '@/domain/scheduling/fsrs';
import type { SqlDriver } from '@/services/db/driver';
import { exportBundle, importBundle, type LibraryBundle } from '@/services/import-export/bundle';
import * as cards from '@/services/repositories/cards';
import * as folders from '@/services/repositories/folders';
import * as progress from '@/services/repositories/progress';
import { search as searchRepo } from '@/services/repositories/search';
import * as sessions from '@/services/repositories/sessions';
import * as sets from '@/services/repositories/sets';
import * as stats from '@/services/repositories/stats';
import * as users from '@/services/repositories/users';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SetDetail {
  set: StudySetSummary;
  cards: Flashcard[];
  progress: Record<Id, CardProgress>;
  canEdit: boolean;
}

export interface StatsOverview {
  totals: stats.StatsTotals;
  activity: stats.DayActivity[];
  accuracy: stats.SetAccuracy[];
  due: { dueNow: number; dueToday: number };
  states: Awaited<ReturnType<typeof stats.reviewStateCounts>>;
}

export interface CoreDeps {
  /** Remove a media file that no card references any more. */
  deleteMedia?: (relativePath: string) => Promise<void>;
  /** FSRS desired retention (per-instance default). */
  requestRetention?: number;
}

export function createCoreApi(db: SqlDriver, user: User, deps: CoreDeps = {}) {
  const me = user.id;
  const isAdmin = user.role === 'admin';
  const scheduler = createScheduler({ enableFuzz: true, requestRetention: deps.requestRetention });

  async function access(setId: Id) {
    const a = await sets.getSetAccess(db, setId);
    if (!a) throw new ApiError('Study set not found', 404);
    return a;
  }

  async function assertCanView(setId: Id) {
    const a = await access(setId);
    if (a.ownerId !== me && a.visibility !== 'shared' && !isAdmin)
      throw new ApiError('Study set not found', 404);
    return a;
  }

  async function assertCanEdit(setId: Id) {
    const a = await access(setId);
    if (a.ownerId !== me && !isAdmin) {
      throw new ApiError(
        a.visibility === 'shared' ? 'Only the owner can change this set' : 'Study set not found',
        a.visibility === 'shared' ? 403 : 404,
      );
    }
    return a;
  }

  async function assertCardsEditable(cardIds: readonly Id[]) {
    const setIds = await cards.setIdsForCards(db, cardIds);
    if (setIds.length === 0 && cardIds.length > 0) throw new ApiError('Card not found', 404);
    for (const s of setIds) await assertCanEdit(s);
  }

  async function assertCardsVisible(cardIds: readonly Id[]) {
    if (!isAdmin && !(await progress.cardsVisibleTo(db, me, cardIds)))
      throw new ApiError('Card not found', 404);
  }

  async function assertFolderOwned(folderId: Id | null | undefined) {
    if (!folderId) return;
    if ((await folders.getFolderOwner(db, folderId)) !== me)
      throw new ApiError('Folder not found', 404);
  }

  async function cleanupMedia(paths: string[]) {
    if (!deps.deleteMedia) return;
    for (const p of paths) {
      try {
        await deps.deleteMedia(p);
      } catch (e) {
        console.warn('could not remove media', p, e);
      }
    }
  }

  return {
    async me(): Promise<User> {
      return user;
    },

    listSets: (opts: sets.ListSetsOptions = {}) => sets.listSets(db, me, opts),

    async getSet(id: Id): Promise<SetDetail> {
      const a = await assertCanView(id);
      const [set, list, prog] = await Promise.all([
        sets.getSetSummary(db, me, id),
        cards.listCards(db, id),
        progress.getProgressForSet(db, me, id),
      ]);
      if (!set || (a.deleted && a.ownerId !== me)) throw new ApiError('Study set not found', 404);
      return { set, cards: list, progress: prog, canEdit: a.ownerId === me || isAdmin };
    },

    async createSet(draft: sets.SetDraft): Promise<Id> {
      await assertFolderOwned(draft.folderId);
      return sets.createSet(db, me, draft);
    },

    async updateSet(id: Id, patch: sets.SetPatch) {
      await assertCanEdit(id);
      await assertFolderOwned(patch.folderId);
      await sets.updateSet(db, id, patch);
    },

    async setTags(id: Id, tags: string[]) {
      await assertCanEdit(id);
      await sets.setTags(db, id, tags);
    },

    /** Duplicate my set, or copy a shared set into my library. */
    async duplicateSet(id: Id): Promise<Id> {
      const a = await assertCanView(id);
      return sets.duplicateSet(db, id, me, a.ownerId === me ? ' (copy)' : '');
    },

    async archiveSet(id: Id, archived: boolean) {
      await assertCanEdit(id);
      await sets.archiveSet(db, id, archived);
    },

    async trashSet(id: Id) {
      await assertCanEdit(id);
      await sets.trashSet(db, id);
    },

    async restoreSet(id: Id) {
      await assertCanEdit(id);
      await sets.restoreSet(db, id);
    },

    async purgeSet(id: Id) {
      await assertCanEdit(id);
      await cleanupMedia(await sets.purgeSets(db, [id]));
    },

    async emptyTrash() {
      const trashed = await sets.listTrash(db, me);
      await cleanupMedia(
        await sets.purgeSets(
          db,
          trashed.map((s) => s.id),
        ),
      );
    },

    listTrash: () => sets.listTrash(db, me),
    listTags: () => sets.listTags(db, me),

    async touchOpened(id: Id) {
      await assertCanView(id);
      await sets.touchOpened(db, me, id);
    },

    listFolders: () => folders.listFolders(db, me),
    createFolder: (name: string) => folders.createFolder(db, me, name),
    async renameFolder(id: Id, name: string) {
      await assertFolderOwned(id);
      await folders.renameFolder(db, id, name);
    },
    async deleteFolder(id: Id) {
      await assertFolderOwned(id);
      await folders.deleteFolder(db, id);
    },

    /** `id` lets the client create cards optimistically with its own UUID. */
    async createCard(setId: Id, draft: cards.CardDraft, afterCardId?: Id, id?: Id): Promise<Id> {
      await assertCanEdit(setId);
      return cards.createCard(db, setId, draft, afterCardId, id);
    },

    async insertCards(setId: Id, drafts: cards.CardDraft[]): Promise<Id[]> {
      await assertCanEdit(setId);
      return cards.insertCards(db, setId, drafts);
    },

    async updateCard(id: Id, patch: Parameters<typeof cards.updateCard>[2]) {
      await assertCardsEditable([id]);
      await cards.updateCard(db, id, patch);
    },

    async deleteCards(ids: Id[]) {
      await assertCardsEditable(ids);
      await cards.deleteCards(db, ids);
    },

    async reorderCards(setId: Id, orderedIds: Id[]) {
      await assertCanEdit(setId);
      await cards.reorderCards(db, setId, orderedIds);
    },

    async duplicateCard(id: Id): Promise<Id> {
      await assertCardsEditable([id]);
      return cards.duplicateCard(db, id);
    },

    async swapSides(ids: Id[]) {
      await assertCardsEditable(ids);
      await cards.swapSides(db, ids);
    },

    async setCardMedia(
      cardId: Id,
      side: 'front' | 'back',
      relativePath: string | null,
      mimeType = '',
    ) {
      await assertCardsEditable([cardId]);
      const before = await db.select<{ relative_path: string }>(
        'SELECT relative_path FROM card_media WHERE flashcard_id = ? AND side = ?',
        [cardId, side],
      );
      if (relativePath) await cards.addCardMedia(db, cardId, side, relativePath, mimeType);
      else await cards.removeCardMedia(db, cardId, side);
      const orphans: string[] = [];
      for (const b of before)
        if (!(await cards.isMediaReferenced(db, b.relative_path))) orphans.push(b.relative_path);
      await cleanupMedia(orphans);
    },

    async setStarred(cardId: Id, starred: boolean) {
      await assertCardsVisible([cardId]);
      await progress.setStarred(db, me, cardId, starred);
    },

    async setKnown(cardIds: Id[], known: boolean | null) {
      await assertCardsVisible(cardIds);
      await progress.setKnown(db, me, cardIds, known);
    },

    async resetProgress(setId: Id) {
      await assertCanView(setId);
      await progress.resetSetProgress(db, me, setId);
    },

    async recordReview(cardId: Id, rating: ReviewRating, responseTimeMs?: number | null) {
      await assertCardsVisible([cardId]);
      return progress.recordReview(db, scheduler, me, cardId, rating, { responseTimeMs });
    },

    async reviewQueue(opts: { setId?: Id; limit?: number; newLimit?: number } = {}) {
      if (opts.setId) await assertCanView(opts.setId);
      return progress.reviewQueue(db, me, opts);
    },

    /** Preview next-due timestamps for each rating (for button hints). */
    previewReview(scheduling: Parameters<typeof scheduler.preview>[0] | null) {
      const at = Date.now();
      return scheduler.preview(scheduling ?? scheduler.newCard(at), at);
    },

    dueCounts: (endOfDay: number) => progress.dueCounts(db, me, Date.now(), endOfDay),

    async findActiveSession<S>(setId: Id, mode: StudyMode): Promise<StudySession<S> | null> {
      await assertCanView(setId);
      return sessions.findActiveSession<S>(db, me, setId, mode);
    },

    async createSession<S>(setId: Id, mode: StudyMode, state: S): Promise<Id> {
      await assertCanView(setId);
      return sessions.createSession(db, me, setId, mode, state);
    },

    async saveSession<S>(
      id: Id,
      state: S,
      opts: { completed?: boolean; attempts?: sessions.AttemptDraft[] } = {},
    ) {
      if (opts.attempts?.length) await assertCardsVisible(opts.attempts.map((a) => a.flashcardId));
      await sessions.saveSession(db, me, id, state, opts);
    },

    discardSession: (id: Id) => sessions.discardSession(db, me, id),
    resumableSessions: (limit?: number) => sessions.resumableSessions(db, me, limit),

    async recordMatchTime(setId: Id, pairCount: number, timeMs: number) {
      await assertCanView(setId);
      return sessions.recordMatchTime(db, me, setId, pairCount, timeMs);
    },

    async bestMatchTime(setId: Id, pairCount: number) {
      await assertCanView(setId);
      return sessions.bestMatchTime(db, me, setId, pairCount);
    },

    async getStats(opts: {
      tzOffsetMs: number;
      days: number;
      startOfDay: number;
      endOfDay: number;
    }): Promise<StatsOverview> {
      const since = opts.startOfDay - (opts.days - 1) * 86_400_000;
      const [totals, activity, accuracy, due, states] = await Promise.all([
        stats.totals(db, me, opts.startOfDay),
        stats.activityByDay(db, me, since, opts.tzOffsetMs),
        stats.accuracyBySet(db, me),
        progress.dueCounts(db, me, Date.now(), opts.endOfDay),
        stats.reviewStateCounts(db, me),
      ]);
      return { totals, activity, accuracy, due, states };
    },

    search: (query: string, limit?: number) => searchRepo(db, me, query, limit),

    getSettings: () => users.getSettings(db, me),
    setSetting: (key: string, value: unknown) => users.setSetting(db, me, key, value),

    /** Export sets I can see (all of mine by default) as a portable bundle. */
    async exportLibrary(
      opts: { setIds?: Id[]; includeProgress?: boolean } = {},
    ): Promise<LibraryBundle> {
      const ids =
        opts.setIds ?? (await sets.listSets(db, me, { archived: 'include' })).map((s) => s.id);
      for (const id of ids) await assertCanView(id);
      return exportBundle(db, me, ids, { includeProgress: opts.includeProgress ?? false });
    },

    /** Import a bundle as new sets in my library (never overwrites existing data). */
    importLibrary: (bundle: LibraryBundle, opts: { includeProgress?: boolean } = {}) =>
      importBundle(db, me, bundle, opts),

    async listUsers() {
      if (!isAdmin) throw new ApiError('Admins only', 403);
      return users.listUsers(db);
    },

    async setUserRole(id: Id, role: 'admin' | 'member') {
      if (!isAdmin) throw new ApiError('Admins only', 403);
      if (id === me && role !== 'admin')
        throw new ApiError("You can't remove your own admin role", 409);
      await users.updateUserProfile(db, id, { role });
    },

    async setUserDisabled(id: Id, disabled: boolean) {
      if (!isAdmin) throw new ApiError('Admins only', 403);
      if (id === me) throw new ApiError("You can't disable yourself", 409);
      await users.setUserDisabled(db, id, disabled);
    },

    async updateProfile(patch: { displayName?: string; email?: string | null }) {
      await users.updateUserProfile(db, me, patch);
    },
  };
}

export type CoreApi = ReturnType<typeof createCoreApi>;
export type ApiMethod = keyof CoreApi;
