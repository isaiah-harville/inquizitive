import {
  type CardProgress,
  FsrsState,
  type Id,
  type ReviewRating,
  type StudyCard,
} from '@/domain/models';
import { parseSchedulingCard, type Scheduler, type SchedulingCard } from '@/domain/scheduling/fsrs';
import { newId, now } from '@/lib/id';
import type { SqlDriver } from '@/services/db/driver';
import { stmt } from '@/services/db/driver';
import { num, numOrNull, placeholders } from './sql';

interface ProgressRow {
  flashcard_id: string;
  starred: number;
  known: number | null;
  review_count: number;
  lapses: number;
  fsrs_state: number;
  stability: number;
  difficulty: number;
  last_reviewed_at: number | null;
  next_review_at: number | null;
  scheduling_state: string | null;
}

function mapProgress(r: ProgressRow): CardProgress {
  return {
    flashcardId: r.flashcard_id,
    starred: num(r.starred) === 1,
    known: r.known === null ? null : num(r.known) === 1,
    reviewCount: num(r.review_count),
    lapses: num(r.lapses),
    fsrsState: num(r.fsrs_state) as FsrsState,
    stability: num(r.stability),
    difficulty: num(r.difficulty),
    lastReviewedAt: numOrNull(r.last_reviewed_at),
    nextReviewAt: numOrNull(r.next_review_at),
    schedulingState: r.scheduling_state,
  };
}

export async function getProgressForSet(
  db: SqlDriver,
  userId: Id,
  setId: Id,
): Promise<Record<Id, CardProgress>> {
  const rows = await db.select<ProgressRow>(
    `SELECT p.* FROM card_progress p JOIN flashcards f ON f.id = p.flashcard_id
     WHERE p.user_id = ? AND f.set_id = ?`,
    [userId, setId],
  );
  return Object.fromEntries(rows.map((r) => [r.flashcard_id, mapProgress(r)]));
}

const upsert = (column: 'starred' | 'known') =>
  `INSERT INTO card_progress (user_id, flashcard_id, ${column}, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (user_id, flashcard_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`;

export async function setStarred(
  db: SqlDriver,
  userId: Id,
  cardId: Id,
  starred: boolean,
): Promise<void> {
  await db.execute(upsert('starred'), [userId, cardId, starred ? 1 : 0, now()]);
}

/** Flashcard-mode known/unknown marks (null clears). Independent of FSRS scheduling. */
export async function setKnown(
  db: SqlDriver,
  userId: Id,
  cardIds: readonly Id[],
  known: boolean | null,
): Promise<void> {
  const at = now();
  await db.batch(
    cardIds.map((id) =>
      stmt(upsert('known'), userId, id, known === null ? null : known ? 1 : 0, at),
    ),
  );
}

/** Clear the known/starred markers and scheduling for a set (history is kept). */
export async function resetSetProgress(db: SqlDriver, userId: Id, setId: Id): Promise<void> {
  await db.execute(
    'DELETE FROM card_progress WHERE user_id = ? AND flashcard_id IN (SELECT id FROM flashcards WHERE set_id = ?)',
    [userId, setId],
  );
}

export interface ReviewResult {
  card: SchedulingCard;
  intervalDays: number;
}

/** Apply an FSRS rating: update scheduling state and append to review history atomically. */
export async function recordReview(
  db: SqlDriver,
  scheduler: Scheduler,
  userId: Id,
  cardId: Id,
  rating: ReviewRating,
  opts: { at?: number; responseTimeMs?: number | null } = {},
): Promise<ReviewResult> {
  const at = opts.at ?? now();
  const [row] = await db.select<{ scheduling_state: string | null; review_count: number }>(
    'SELECT scheduling_state, review_count FROM card_progress WHERE user_id = ? AND flashcard_id = ?',
    [userId, cardId],
  );
  const current = parseSchedulingCard(row?.scheduling_state ?? null) ?? scheduler.newCard(at);
  const outcome = scheduler.review(current, rating, at);
  const next = outcome.card;
  await db.batch([
    stmt(
      `INSERT INTO card_progress (user_id, flashcard_id, review_count, lapses, fsrs_state, stability, difficulty,
                                  last_reviewed_at, next_review_at, scheduling_state, updated_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, flashcard_id) DO UPDATE SET
         review_count = card_progress.review_count + 1, lapses = excluded.lapses, fsrs_state = excluded.fsrs_state,
         stability = excluded.stability, difficulty = excluded.difficulty, last_reviewed_at = excluded.last_reviewed_at,
         next_review_at = excluded.next_review_at, scheduling_state = excluded.scheduling_state,
         updated_at = excluded.updated_at`,
      userId,
      cardId,
      next.lapses,
      next.state,
      next.stability,
      next.difficulty,
      at,
      next.due,
      JSON.stringify(next),
      at,
    ),
    stmt(
      `INSERT INTO review_events (id, user_id, flashcard_id, reviewed_at, rating, response_time_ms, scheduled_days, fsrs_state_before)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      userId,
      cardId,
      at,
      rating,
      opts.responseTimeMs ?? null,
      outcome.intervalDays,
      outcome.stateBefore,
    ),
    stmt(
      `INSERT INTO set_activity (user_id, set_id, last_studied_at) SELECT ?, set_id, ? FROM flashcards WHERE id = ?
       ON CONFLICT (user_id, set_id) DO UPDATE SET last_studied_at = excluded.last_studied_at`,
      userId,
      at,
      cardId,
    ),
  ]);
  return { card: next, intervalDays: outcome.intervalDays };
}

export interface ReviewItem {
  card: StudyCard;
  setId: Id;
  setTitle: string;
  scheduling: SchedulingCard | null;
}

interface ReviewRow {
  id: string;
  front: string;
  back: string;
  explanation: string;
  set_id: string;
  title: string;
  scheduling_state: string | null;
}

function mapReview(r: ReviewRow): ReviewItem {
  return {
    card: { id: r.id, front: r.front, back: r.back, explanation: r.explanation },
    setId: r.set_id,
    setTitle: r.title,
    scheduling: parseSchedulingCard(r.scheduling_state),
  };
}

const VISIBLE = "s.deleted_at IS NULL AND (s.owner_id = ? OR s.visibility = 'shared')";

export interface ReviewQueueOptions {
  setId?: Id;
  at?: number;
  limit?: number;
  /** Also introduce never-reviewed cards (only with setId). */
  newLimit?: number;
}

/** Cards due for spaced review (oldest due first), optionally followed by new cards. */
export async function reviewQueue(
  db: SqlDriver,
  userId: Id,
  opts: ReviewQueueOptions = {},
): Promise<ReviewItem[]> {
  const at = opts.at ?? now();
  const params: (string | number)[] = [userId, at, userId];
  let setFilter = '';
  if (opts.setId) {
    setFilter = ' AND f.set_id = ?';
    params.push(opts.setId);
  }
  params.push(opts.limit ?? 200);
  const due = await db.select<ReviewRow>(
    `SELECT f.id, f.front, f.back, f.explanation, f.set_id, s.title, p.scheduling_state
     FROM card_progress p
     JOIN flashcards f ON f.id = p.flashcard_id
     JOIN study_sets s ON s.id = f.set_id
     WHERE p.user_id = ? AND p.next_review_at IS NOT NULL AND p.next_review_at <= ? AND ${VISIBLE}${setFilter}
     ORDER BY p.next_review_at LIMIT ?`,
    params,
  );
  if (!opts.setId || !opts.newLimit) return due.map(mapReview);
  const fresh = await db.select<ReviewRow>(
    `SELECT f.id, f.front, f.back, f.explanation, f.set_id, s.title, NULL AS scheduling_state
     FROM flashcards f
     JOIN study_sets s ON s.id = f.set_id
     LEFT JOIN card_progress p ON p.flashcard_id = f.id AND p.user_id = ?
     WHERE f.set_id = ? AND (p.flashcard_id IS NULL OR p.next_review_at IS NULL)
     ORDER BY f.position LIMIT ?`,
    [userId, opts.setId, opts.newLimit],
  );
  return [...due, ...fresh].map(mapReview);
}

/** Number of cards due now and by the end of the given day. */
export async function dueCounts(db: SqlDriver, userId: Id, at: number, endOfDay: number) {
  const [row] = await db.select<{ now_count: number; today_count: number }>(
    `SELECT sum(CASE WHEN p.next_review_at <= ? THEN 1 ELSE 0 END) AS now_count,
            count(*) AS today_count
     FROM card_progress p JOIN flashcards f ON f.id = p.flashcard_id JOIN study_sets s ON s.id = f.set_id
     WHERE p.user_id = ? AND p.next_review_at IS NOT NULL AND p.next_review_at <= ? AND ${VISIBLE}`,
    [at, userId, endOfDay, userId],
  );
  return { dueNow: num(row?.now_count), dueToday: num(row?.today_count) };
}

/** Are all these cards in sets visible to the user? (authorization helper) */
export async function cardsVisibleTo(
  db: SqlDriver,
  userId: Id,
  cardIds: readonly Id[],
): Promise<boolean> {
  if (cardIds.length === 0) return true;
  const [row] = await db.select<{ n: number }>(
    `SELECT count(*) AS n FROM flashcards f JOIN study_sets s ON s.id = f.set_id
     WHERE f.id IN (${placeholders(cardIds.length)}) AND ${VISIBLE}`,
    [...cardIds, userId],
  );
  return num(row?.n) === new Set(cardIds).size;
}

export { FsrsState };
