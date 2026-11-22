import type { Id } from '@/domain/models';
import type { IdSets, Manifest, Tombstone } from '@/domain/sync';
import type { SqlDriver, SqlParam, Stmt } from '@/services/db/driver';
import { stmt } from '@/services/db/driver';
import { PRUNE_TAGS, tagStatements } from '@/services/repositories/sets';
import { num, numOrNull, placeholders } from '@/services/repositories/sql';
import type { ApplyReport, CardRow, SyncRows } from './rows';

const CHUNK = 500;

async function selectIn<T>(
  db: SqlDriver,
  sql: (ph: string) => string,
  ids: readonly Id[],
  extra: SqlParam[] = [],
) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    out.push(...(await db.select<T>(sql(placeholders(chunk.length)), [...chunk, ...extra])));
  }
  return out;
}

const OWNED_CARDS =
  'SELECT f.* FROM flashcards f JOIN study_sets s ON s.id = f.set_id WHERE s.owner_id = ?';

export async function buildManifest(db: SqlDriver, ownerId: Id): Promise<Manifest> {
  const [folders, sets, cards, progress, reviews, tombstones] = await Promise.all([
    db.select<{ id: string; updated_at: number }>(
      'SELECT id, updated_at FROM folders WHERE owner_id = ?',
      [ownerId],
    ),
    db.select<{ id: string; updated_at: number }>(
      'SELECT id, updated_at FROM study_sets WHERE owner_id = ?',
      [ownerId],
    ),
    db.select<{ id: string; updated_at: number }>(
      `SELECT f.id, f.updated_at FROM (${OWNED_CARDS}) f`,
      [ownerId],
    ),
    db.select<{ id: string; updated_at: number }>(
      `SELECT p.flashcard_id AS id, p.updated_at FROM card_progress p JOIN (${OWNED_CARDS}) f ON f.id = p.flashcard_id
       WHERE p.user_id = ?`,
      [ownerId, ownerId],
    ),
    db.select<{ id: string }>(
      `SELECT r.id FROM review_events r JOIN (${OWNED_CARDS}) f ON f.id = r.flashcard_id WHERE r.user_id = ?`,
      [ownerId, ownerId],
    ),
    db.select<{ entity: Tombstone['entity']; id: string; deleted_at: number }>(
      'SELECT entity, id, deleted_at FROM sync_tombstones WHERE owner_id = ?',
      [ownerId],
    ),
  ]);
  const map = (rows: { id: string; updated_at: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.id, num(r.updated_at)]));
  return {
    folders: map(folders),
    sets: map(sets),
    cards: map(cards),
    progress: map(progress),
    reviews: reviews.map((r) => r.id),
    tombstones: tombstones.map((t) => ({
      entity: t.entity,
      id: t.id,
      deletedAt: num(t.deleted_at),
    })),
  };
}

export async function exportRows(db: SqlDriver, ownerId: Id, want: IdSets): Promise<SyncRows> {
  const [folders, sets, cards, progress, reviews] = await Promise.all([
    selectIn<Record<string, unknown>>(
      db,
      (ph) => `SELECT * FROM folders WHERE id IN (${ph}) AND owner_id = ?`,
      want.folders,
      [ownerId],
    ),
    selectIn<Record<string, unknown>>(
      db,
      (ph) => `SELECT * FROM study_sets WHERE id IN (${ph}) AND owner_id = ?`,
      want.sets,
      [ownerId],
    ),
    selectIn<Record<string, unknown>>(
      db,
      (ph) =>
        `SELECT f.* FROM flashcards f JOIN study_sets s ON s.id = f.set_id WHERE f.id IN (${ph}) AND s.owner_id = ?`,
      want.cards,
      [ownerId],
    ),
    selectIn<Record<string, unknown>>(
      db,
      (ph) => `SELECT * FROM card_progress WHERE flashcard_id IN (${ph}) AND user_id = ?`,
      want.progress,
      [ownerId],
    ),
    selectIn<Record<string, unknown>>(
      db,
      (ph) => `SELECT * FROM review_events WHERE id IN (${ph}) AND user_id = ?`,
      want.reviews,
      [ownerId],
    ),
  ]);
  const setIds = sets.map((s) => s.id as string);
  const cardIds = cards.map((c) => c.id as string);
  const [tags, answers, media] = await Promise.all([
    selectIn<{ set_id: string; name: string }>(
      db,
      (ph) =>
        `SELECT st.set_id, t.name FROM study_set_tags st JOIN tags t ON t.id = st.tag_id WHERE st.set_id IN (${ph})`,
      setIds,
    ),
    selectIn<{ flashcard_id: string; answer: string }>(
      db,
      (ph) =>
        `SELECT flashcard_id, answer FROM accepted_answers WHERE flashcard_id IN (${ph}) ORDER BY flashcard_id, position`,
      cardIds,
    ),
    selectIn<{
      flashcard_id: string;
      side: 'front' | 'back';
      relative_path: string;
      mime_type: string;
    }>(
      db,
      (ph) =>
        `SELECT flashcard_id, side, relative_path, mime_type FROM card_media WHERE flashcard_id IN (${ph})`,
      cardIds,
    ),
  ]);
  const group = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r[key] as string, [...(m.get(r[key] as string) ?? []), r]);
    return m;
  };
  const tagsBy = group(tags, 'set_id');
  const answersBy = group(answers, 'flashcard_id');
  const mediaBy = group(media, 'flashcard_id');

  return {
    folders: folders.map((f) => ({
      id: f.id as string,
      name: f.name as string,
      createdAt: num(f.created_at),
      updatedAt: num(f.updated_at),
    })),
    sets: sets.map((s) => ({
      id: s.id as string,
      folderId: (s.folder_id as string | null) ?? null,
      title: s.title as string,
      description: s.description as string,
      visibility: s.visibility as 'private' | 'shared',
      tags: (tagsBy.get(s.id as string) ?? []).map((t) => t.name),
      createdAt: num(s.created_at),
      updatedAt: num(s.updated_at),
      archivedAt: numOrNull(s.archived_at),
      deletedAt: numOrNull(s.deleted_at),
    })),
    cards: cards.map((c) => ({
      id: c.id as string,
      setId: c.set_id as string,
      front: c.front as string,
      back: c.back as string,
      explanation: c.explanation as string,
      position: num(c.position),
      acceptedAnswers: (answersBy.get(c.id as string) ?? []).map((a) => a.answer),
      media: (mediaBy.get(c.id as string) ?? []).map((m) => ({
        side: m.side,
        path: m.relative_path,
        mimeType: m.mime_type,
      })),
      createdAt: num(c.created_at),
      updatedAt: num(c.updated_at),
    })),
    progress: progress.map((p) => ({
      cardId: p.flashcard_id as string,
      starred: num(p.starred) === 1,
      known: p.known === null ? null : num(p.known) === 1,
      reviewCount: num(p.review_count),
      lapses: num(p.lapses),
      fsrsState: num(p.fsrs_state),
      stability: num(p.stability),
      difficulty: num(p.difficulty),
      lastReviewedAt: numOrNull(p.last_reviewed_at),
      nextReviewAt: numOrNull(p.next_review_at),
      schedulingState: (p.scheduling_state as string | null) ?? null,
      updatedAt: num(p.updated_at),
    })),
    reviews: reviews.map((r) => ({
      id: r.id as string,
      cardId: r.flashcard_id as string,
      reviewedAt: num(r.reviewed_at),
      rating: num(r.rating),
      responseTimeMs: numOrNull(r.response_time_ms),
      scheduledDays: numOrNull(r.scheduled_days),
      fsrsStateBefore: numOrNull(r.fsrs_state_before),
    })),
  };
}

/** Current owner and updated_at for rows that already exist here. */
async function existing(db: SqlDriver, sql: (ph: string) => string, ids: Id[]) {
  const rows = await selectIn<{ id: string; owner_id: string | null; updated_at: number }>(
    db,
    sql,
    ids,
  );
  return new Map(rows.map((r) => [r.id, { owner: r.owner_id, updatedAt: num(r.updated_at) }]));
}

function cardStatements(c: CardRow): Stmt[] {
  return [
    stmt(
      `INSERT INTO flashcards (id, set_id, front, back, explanation, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET set_id = excluded.set_id, front = excluded.front, back = excluded.back,
         explanation = excluded.explanation, position = excluded.position, updated_at = excluded.updated_at`,
      c.id,
      c.setId,
      c.front,
      c.back,
      c.explanation,
      c.position,
      c.createdAt,
      c.updatedAt,
    ),
    stmt('DELETE FROM accepted_answers WHERE flashcard_id = ?', c.id),
    ...c.acceptedAnswers.map((a, i) =>
      stmt(
        'INSERT INTO accepted_answers (id, flashcard_id, answer, position) VALUES (?, ?, ?, ?)',
        `${c.id}:a${i}`,
        c.id,
        a,
        i,
      ),
    ),
    stmt('DELETE FROM card_media WHERE flashcard_id = ?', c.id),
    ...c.media.map((m) =>
      stmt(
        'INSERT INTO card_media (id, flashcard_id, side, relative_path, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        `${c.id}:${m.side}`,
        c.id,
        m.side,
        m.path,
        m.mimeType,
        c.updatedAt,
      ),
    ),
  ];
}

/**
 * Write rows owned by `ownerId`, keeping whichever side changed last. Rows that
 * belong to another user here are skipped, never taken over.
 */
export async function applyRows(db: SqlDriver, ownerId: Id, rows: SyncRows): Promise<ApplyReport> {
  const report: ApplyReport = { written: 0, skipped: 0, deleted: 0 };
  const statements: Stmt[] = [];
  const newer = (
    have: { owner: string | null; updatedAt: number } | undefined,
    updatedAt: number,
  ) => {
    if (have && have.owner !== ownerId) return false;
    return !have || updatedAt > have.updatedAt;
  };

  const folderHave = await existing(
    db,
    (ph) => `SELECT id, owner_id, updated_at FROM folders WHERE id IN (${ph})`,
    rows.folders.map((f) => f.id),
  );
  const myFolders = new Set(
    (await db.select<{ id: string }>('SELECT id FROM folders WHERE owner_id = ?', [ownerId])).map(
      (f) => f.id,
    ),
  );
  for (const f of rows.folders) {
    if (!newer(folderHave.get(f.id), f.updatedAt)) {
      report.skipped++;
      continue;
    }
    myFolders.add(f.id);
    report.written++;
    statements.push(
      stmt(
        `INSERT INTO folders (id, owner_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
        f.id,
        ownerId,
        f.name,
        f.createdAt,
        f.updatedAt,
      ),
    );
  }

  const setHave = await existing(
    db,
    (ph) => `SELECT id, owner_id, updated_at FROM study_sets WHERE id IN (${ph})`,
    rows.sets.map((s) => s.id),
  );
  for (const s of rows.sets) {
    const have = setHave.get(s.id);
    if (!newer(have, s.updatedAt)) {
      report.skipped++;
      continue;
    }
    report.written++;
    statements.push(
      stmt(
        `INSERT INTO study_sets (id, owner_id, folder_id, title, description, visibility, created_at, updated_at, archived_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET folder_id = excluded.folder_id, title = excluded.title,
           description = excluded.description, updated_at = excluded.updated_at,
           archived_at = excluded.archived_at, deleted_at = excluded.deleted_at`,
        s.id,
        ownerId,
        s.folderId && myFolders.has(s.folderId) ? s.folderId : null,
        s.title,
        s.description,
        have ? 'private' : s.visibility,
        s.createdAt,
        s.updatedAt,
        s.archivedAt,
        s.deletedAt,
      ),
      stmt('DELETE FROM study_set_tags WHERE set_id = ?', s.id),
      ...tagStatements(s.id, s.tags),
    );
  }
  statements.push(PRUNE_TAGS);
  await db.batch(statements);

  const mySets = new Set(
    (
      await db.select<{ id: string }>('SELECT id FROM study_sets WHERE owner_id = ?', [ownerId])
    ).map((s) => s.id),
  );
  const cardHave = await existing(
    db,
    (ph) =>
      `SELECT f.id, s.owner_id, f.updated_at FROM flashcards f JOIN study_sets s ON s.id = f.set_id WHERE f.id IN (${ph})`,
    rows.cards.map((c) => c.id),
  );
  const cardStmts: Stmt[] = [];
  for (const c of rows.cards) {
    if (!mySets.has(c.setId) || !newer(cardHave.get(c.id), c.updatedAt)) {
      report.skipped++;
      continue;
    }
    report.written++;
    cardStmts.push(...cardStatements(c));
  }
  await db.batch(cardStmts);

  const myCards = new Set(
    (await db.select<{ id: string }>(`SELECT f.id FROM (${OWNED_CARDS}) f`, [ownerId])).map(
      (c) => c.id,
    ),
  );
  const progressHave = new Map(
    (
      await selectIn<{ flashcard_id: string; updated_at: number }>(
        db,
        (ph) =>
          `SELECT flashcard_id, updated_at FROM card_progress WHERE flashcard_id IN (${ph}) AND user_id = ?`,
        rows.progress.map((p) => p.cardId),
        [ownerId],
      )
    ).map((p) => [p.flashcard_id, num(p.updated_at)]),
  );
  const progressStmts: Stmt[] = [];
  for (const p of rows.progress) {
    const have = progressHave.get(p.cardId);
    if (!myCards.has(p.cardId) || (have !== undefined && have >= p.updatedAt)) {
      report.skipped++;
      continue;
    }
    report.written++;
    progressStmts.push(
      stmt(
        `INSERT INTO card_progress (user_id, flashcard_id, starred, known, review_count, lapses, fsrs_state, stability,
           difficulty, last_reviewed_at, next_review_at, scheduling_state, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, flashcard_id) DO UPDATE SET starred = excluded.starred, known = excluded.known,
           review_count = excluded.review_count, lapses = excluded.lapses, fsrs_state = excluded.fsrs_state,
           stability = excluded.stability, difficulty = excluded.difficulty,
           last_reviewed_at = excluded.last_reviewed_at, next_review_at = excluded.next_review_at,
           scheduling_state = excluded.scheduling_state, updated_at = excluded.updated_at`,
        ownerId,
        p.cardId,
        p.starred ? 1 : 0,
        p.known === null ? null : p.known ? 1 : 0,
        p.reviewCount,
        p.lapses,
        p.fsrsState,
        p.stability,
        p.difficulty,
        p.lastReviewedAt,
        p.nextReviewAt,
        p.schedulingState,
        p.updatedAt,
      ),
    );
  }
  for (const r of rows.reviews) {
    if (!myCards.has(r.cardId)) {
      report.skipped++;
      continue;
    }
    report.written++;
    progressStmts.push(
      stmt(
        `INSERT INTO review_events (id, user_id, flashcard_id, reviewed_at, rating, response_time_ms, scheduled_days, fsrs_state_before)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
        r.id,
        ownerId,
        r.cardId,
        r.reviewedAt,
        r.rating,
        r.responseTimeMs,
        r.scheduledDays,
        r.fsrsStateBefore,
      ),
    );
  }
  await db.batch(progressStmts);
  return report;
}

const TABLE = { folder: 'folders', set: 'study_sets', card: 'flashcards' } as const;

/** Delete rows the other side deleted, unless they were edited here after the deletion. */
export async function applyTombstones(
  db: SqlDriver,
  ownerId: Id,
  tombstones: readonly Tombstone[],
): Promise<number> {
  let deleted = 0;
  for (const entity of ['card', 'set', 'folder'] as const) {
    const list = tombstones.filter((t) => t.entity === entity);
    if (list.length === 0) continue;
    const owned =
      entity === 'card'
        ? 'id IN (SELECT f.id FROM flashcards f JOIN study_sets s ON s.id = f.set_id WHERE s.owner_id = ?)'
        : 'owner_id = ?';
    const statements = list.map((t) =>
      stmt(
        `DELETE FROM ${TABLE[entity]} WHERE id = ? AND updated_at <= ? AND ${owned}`,
        t.id,
        t.deletedAt,
        ownerId,
      ),
    );
    deleted += await db.batch(statements);
  }
  if (deleted) await db.batch([PRUNE_TAGS]);
  return deleted;
}
