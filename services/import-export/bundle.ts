import { z } from 'zod';
import type { Id } from '@/domain/models';
import { newId, now } from '@/lib/id';
import type { SqlDriver, Stmt } from '@/services/db/driver';
import { stmt } from '@/services/db/driver';
import { insertCardStatements } from '@/services/repositories/cards';
import { createSetStatements } from '@/services/repositories/sets';
import { num, numOrNull, placeholders } from '@/services/repositories/sql';

export const BUNDLE_FORMAT = 'inquizitive.library';
export const BUNDLE_VERSION = 1;

const MAX_TEXT = 20_000;
const text = (max = MAX_TEXT) => z.string().max(max);
const MEDIA_NAME = /^[0-9a-fA-F-]{1,64}\.(png|jpe?g|gif|webp|avif)$/i;

const mediaSchema = z.object({
  side: z.enum(['front', 'back']),
  path: z.string().regex(MEDIA_NAME, 'invalid media file name'),
  mimeType: z.string().max(100),
});

const cardSchema = z.object({
  id: z.string().min(1).max(64),
  front: text(),
  back: text(),
  explanation: text().default(''),
  position: z.number().finite().optional(),
  acceptedAnswers: z.array(text(500)).max(50).default([]),
  media: z.array(mediaSchema).max(2).default([]),
});

const setSchema = z.object({
  id: z.string().min(1).max(64),
  folderId: z.string().max(64).nullable().default(null),
  title: text(300),
  description: text().default(''),
  tags: z.array(text(40)).max(50).default([]),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  archivedAt: z.number().nullable().optional(),
  cards: z.array(cardSchema).max(20_000),
});

const progressSchema = z.object({
  cardId: z.string().max(64),
  starred: z.boolean().default(false),
  known: z.boolean().nullable().default(null),
  reviewCount: z.number().int().min(0).default(0),
  lapses: z.number().int().min(0).default(0),
  fsrsState: z.number().int().min(0).max(3).default(0),
  stability: z.number().default(0),
  difficulty: z.number().default(0),
  lastReviewedAt: z.number().nullable().default(null),
  nextReviewAt: z.number().nullable().default(null),
  schedulingState: z.string().max(2000).nullable().default(null),
});

const reviewSchema = z.object({
  cardId: z.string().max(64),
  reviewedAt: z.number(),
  rating: z.number().int().min(1).max(4),
  responseTimeMs: z.number().nullable().default(null),
  scheduledDays: z.number().nullable().default(null),
});

export const bundleSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.number(),
  folders: z
    .array(
      z.object({
        id: z.string().max(64),
        name: text(200),
        parentId: z.string().max(64).nullable().default(null),
      }),
    )
    .default([]),
  sets: z.array(setSchema).max(5_000),
  progress: z.array(progressSchema).optional(),
  reviews: z.array(reviewSchema).optional(),
});

export type LibraryBundle = z.infer<typeof bundleSchema>;
export type BundleSet = z.infer<typeof setSchema>;

/** Validate untrusted JSON. Throws a readable error for malformed or future-version files. */
export function parseBundle(input: unknown): LibraryBundle {
  if (
    typeof input === 'object' &&
    input &&
    'version' in input &&
    typeof input.version === 'number'
  ) {
    if (input.version > BUNDLE_VERSION) {
      throw new Error(
        `This file was made by a newer version of Inquizitive (format v${input.version}). Please update.`,
      );
    }
  }
  const result = bundleSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Not a valid Inquizitive library file: ${issue.path.join('.') || 'root'} — ${issue.message}`,
    );
  }
  return result.data;
}

/** All media file names referenced by a bundle. */
export function bundleMediaPaths(bundle: LibraryBundle): string[] {
  return [
    ...new Set(bundle.sets.flatMap((s) => s.cards.flatMap((c) => c.media.map((m) => m.path)))),
  ];
}

export async function exportBundle(
  db: SqlDriver,
  userId: Id,
  setIds: readonly Id[],
  opts: { includeProgress: boolean },
): Promise<LibraryBundle> {
  if (setIds.length === 0) {
    return {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      exportedAt: now(),
      folders: [],
      sets: [],
    };
  }
  const ph = placeholders(setIds.length);
  const [setRows, cardRows, answerRows, mediaRows, tagRows, folderRows] = await Promise.all([
    db.select<Record<string, unknown>>(`SELECT * FROM study_sets WHERE id IN (${ph})`, [...setIds]),
    db.select<Record<string, unknown>>(
      `SELECT * FROM flashcards WHERE set_id IN (${ph}) ORDER BY set_id, position`,
      [...setIds],
    ),
    db.select<{ flashcard_id: string; answer: string }>(
      `SELECT a.flashcard_id, a.answer FROM accepted_answers a JOIN flashcards f ON f.id = a.flashcard_id
       WHERE f.set_id IN (${ph}) ORDER BY a.flashcard_id, a.position`,
      [...setIds],
    ),
    db.select<{
      flashcard_id: string;
      side: 'front' | 'back';
      relative_path: string;
      mime_type: string;
    }>(
      `SELECT m.* FROM card_media m JOIN flashcards f ON f.id = m.flashcard_id WHERE f.set_id IN (${ph})`,
      [...setIds],
    ),
    db.select<{ set_id: string; name: string }>(
      `SELECT st.set_id, t.name FROM study_set_tags st JOIN tags t ON t.id = st.tag_id WHERE st.set_id IN (${ph})`,
      [...setIds],
    ),
    db.select<{ id: string; name: string; parent_id: string | null }>(
      'SELECT * FROM folders WHERE owner_id = ?',
      [userId],
    ),
  ]);

  const group = <T, K extends string>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return m;
  };
  const cardsBySet = group(cardRows, (r) => r.set_id as string);
  const answersByCard = group(answerRows, (r) => r.flashcard_id);
  const mediaByCard = group(mediaRows, (r) => r.flashcard_id);
  const tagsBySet = group(tagRows, (r) => r.set_id);
  const usedFolders = new Set(setRows.map((s) => s.folder_id).filter(Boolean));

  const bundle: LibraryBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: now(),
    folders: folderRows
      .filter((f) => usedFolders.has(f.id))
      .map((f) => ({ id: f.id, name: f.name, parentId: null })),
    sets: setRows.map((s) => ({
      id: s.id as string,
      folderId: s.owner_id === userId ? ((s.folder_id as string | null) ?? null) : null,
      title: s.title as string,
      description: s.description as string,
      tags: (tagsBySet.get(s.id as string) ?? []).map((t) => t.name),
      createdAt: num(s.created_at),
      updatedAt: num(s.updated_at),
      archivedAt: numOrNull(s.archived_at),
      cards: (cardsBySet.get(s.id as string) ?? []).map((c) => ({
        id: c.id as string,
        front: c.front as string,
        back: c.back as string,
        explanation: c.explanation as string,
        position: num(c.position),
        acceptedAnswers: (answersByCard.get(c.id as string) ?? []).map((a) => a.answer),
        media: (mediaByCard.get(c.id as string) ?? []).map((m) => ({
          side: m.side,
          path: m.relative_path,
          mimeType: m.mime_type,
        })),
      })),
    })),
  };

  if (opts.includeProgress) {
    const progress = await db.select<Record<string, unknown>>(
      `SELECT p.* FROM card_progress p JOIN flashcards f ON f.id = p.flashcard_id WHERE p.user_id = ? AND f.set_id IN (${ph})`,
      [userId, ...setIds],
    );
    const reviews = await db.select<Record<string, unknown>>(
      `SELECT r.* FROM review_events r JOIN flashcards f ON f.id = r.flashcard_id WHERE r.user_id = ? AND f.set_id IN (${ph})
       ORDER BY r.reviewed_at`,
      [userId, ...setIds],
    );
    bundle.progress = progress.map((p) => ({
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
    }));
    bundle.reviews = reviews.map((r) => ({
      cardId: r.flashcard_id as string,
      reviewedAt: num(r.reviewed_at),
      rating: num(r.rating),
      responseTimeMs: numOrNull(r.response_time_ms),
      scheduledDays: numOrNull(r.scheduled_days),
    }));
  }
  return bundle;
}

export interface ImportReport {
  setsImported: number;
  cardsImported: number;
  /** Sets whose id already exists and were imported as copies with new ids. */
  setsCopied: number;
  foldersCreated: number;
}

/**
 * Import a bundle into `userId`'s library in one transaction.
 * Ids are preserved when free (so a backup restores exactly); anything that
 * already exists gets a fresh id instead, so nothing is ever overwritten.
 */
export async function importBundle(
  db: SqlDriver,
  userId: Id,
  input: unknown,
  opts: { includeProgress?: boolean } = {},
): Promise<ImportReport> {
  const bundle = parseBundle(input);
  const at = now();

  const allSetIds = bundle.sets.map((s) => s.id);
  const allCardIds = bundle.sets.flatMap((s) => s.cards.map((c) => c.id));
  const existing = async (table: string, ids: string[]) => {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      if (chunk.length === 0) continue;
      const rows = await db.select<{ id: string }>(
        `SELECT id FROM ${table} WHERE id IN (${placeholders(chunk.length)})`,
        chunk,
      );
      for (const r of rows) found.add(r.id);
    }
    return found;
  };
  const takenSets = await existing('study_sets', allSetIds);
  const takenCards = await existing('flashcards', allCardIds);
  const takenFolders = await existing(
    'folders',
    bundle.folders.map((f) => f.id),
  );
  const myFolders = new Set(
    (await db.select<{ id: string }>('SELECT id FROM folders WHERE owner_id = ?', [userId])).map(
      (r) => r.id,
    ),
  );

  const statements: Stmt[] = [];
  const folderMap = new Map<string, string>();
  let foldersCreated = 0;
  for (const f of bundle.folders) {
    if (myFolders.has(f.id)) {
      folderMap.set(f.id, f.id);
      continue;
    }
    const id = takenFolders.has(f.id) ? newId() : f.id;
    folderMap.set(f.id, id);
    foldersCreated++;
    statements.push(
      stmt(
        'INSERT INTO folders (id, owner_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
        id,
        userId,
        f.name,
        at,
        at,
      ),
    );
  }

  const cardMap = new Map<string, string>();
  const seenSets = new Set<string>();
  const seenCards = new Set<string>();
  let setsCopied = 0;
  let cardsImported = 0;
  for (const s of bundle.sets) {
    const copy = takenSets.has(s.id) || seenSets.has(s.id);
    const setId = copy ? newId() : s.id;
    seenSets.add(s.id);
    if (copy) setsCopied++;
    const created = s.createdAt ?? at;
    statements.push(
      ...createSetStatements(
        setId,
        userId,
        {
          title: s.title,
          description: s.description,
          folderId: s.folderId ? (folderMap.get(s.folderId) ?? null) : null,
          tags: s.tags,
        },
        created,
      ),
    );
    if (s.archivedAt)
      statements.push(
        stmt('UPDATE study_sets SET archived_at = ? WHERE id = ?', s.archivedAt, setId),
      );
    s.cards.forEach((c, i) => {
      const cardId = takenCards.has(c.id) || seenCards.has(c.id) ? newId() : c.id;
      seenCards.add(c.id);
      cardMap.set(c.id, cardId);
      cardsImported++;
      statements.push(...insertCardStatements(setId, cardId, c, c.position ?? i + 1, at));
      for (const m of c.media) {
        statements.push(
          stmt(
            'INSERT INTO card_media (id, flashcard_id, side, relative_path, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            newId(),
            cardId,
            m.side,
            m.path,
            m.mimeType,
            at,
          ),
        );
      }
    });
  }

  if (opts.includeProgress) {
    for (const p of bundle.progress ?? []) {
      const cardId = cardMap.get(p.cardId);
      if (!cardId) continue;
      statements.push(
        stmt(
          `INSERT INTO card_progress (user_id, flashcard_id, starred, known, review_count, lapses, fsrs_state, stability,
             difficulty, last_reviewed_at, next_review_at, scheduling_state, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          userId,
          cardId,
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
          at,
        ),
      );
    }
    for (const r of bundle.reviews ?? []) {
      const cardId = cardMap.get(r.cardId);
      if (!cardId) continue;
      statements.push(
        stmt(
          `INSERT INTO review_events (id, user_id, flashcard_id, reviewed_at, rating, response_time_ms, scheduled_days)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          newId(),
          userId,
          cardId,
          r.reviewedAt,
          r.rating,
          r.responseTimeMs,
          r.scheduledDays,
        ),
      );
    }
  }

  await db.batch(statements);
  return { setsImported: bundle.sets.length, cardsImported, setsCopied, foldersCreated };
}
