import type { Id } from '@/domain/models';
import type { Dialect, SqlDriver } from '@/services/db/driver';
import { num } from './sql';

/** SQL expression bucketing an epoch-ms column into a local YYYY-MM-DD day. */
function dayExpr(dialect: Dialect, column: string): string {
  return dialect === 'postgres'
    ? `to_char(to_timestamp((${column} + ?) / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
    : `date((${column} + ?) / 1000, 'unixepoch')`;
}

export interface DayActivity {
  day: string;
  count: number;
}

/**
 * Study activity (answers + reviews) per local day since `since`.
 * `tzOffsetMs` is added to UTC timestamps to get local time.
 */
export async function activityByDay(
  db: SqlDriver,
  userId: Id,
  since: number,
  tzOffsetMs: number,
): Promise<DayActivity[]> {
  const rows = await db.select<{ day: string; n: number }>(
    `SELECT day, sum(n) AS n FROM (
       SELECT ${dayExpr(db.dialect, 'a.answered_at')} AS day, count(*) AS n
       FROM study_attempts a JOIN study_sessions s ON s.id = a.session_id
       WHERE s.user_id = ? AND a.answered_at >= ? GROUP BY 1
       UNION ALL
       SELECT ${dayExpr(db.dialect, 'r.reviewed_at')} AS day, count(*) AS n
       FROM review_events r WHERE r.user_id = ? AND r.reviewed_at >= ? GROUP BY 1
     ) t GROUP BY day ORDER BY day`,
    [tzOffsetMs, userId, since, tzOffsetMs, userId, since],
  );
  return rows.map((r) => ({ day: r.day, count: num(r.n) }));
}

export interface SetAccuracy {
  setId: Id;
  title: string;
  correct: number;
  total: number;
}

export async function accuracyBySet(db: SqlDriver, userId: Id, limit = 20): Promise<SetAccuracy[]> {
  const rows = await db.select<{ set_id: string; title: string; correct: number; total: number }>(
    `SELECT st.id AS set_id, st.title, sum(a.correct) AS correct, count(*) AS total
     FROM study_attempts a
     JOIN study_sessions s ON s.id = a.session_id
     JOIN study_sets st ON st.id = s.set_id AND st.deleted_at IS NULL
     WHERE s.user_id = ?
     GROUP BY st.id, st.title
     ORDER BY max(a.answered_at) DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map((r) => ({
    setId: r.set_id,
    title: r.title,
    correct: num(r.correct),
    total: num(r.total),
  }));
}

export interface StatsTotals {
  cardsStudied: number;
  answersToday: number;
  reviewsToday: number;
  totalReviews: number;
  totalAnswers: number;
}

export async function totals(db: SqlDriver, userId: Id, startOfDay: number): Promise<StatsTotals> {
  const [row] = await db.select<Record<string, number>>(
    `SELECT
       (SELECT count(*) FROM (
          SELECT a.flashcard_id FROM study_attempts a JOIN study_sessions s ON s.id = a.session_id WHERE s.user_id = ?
          UNION
          SELECT r.flashcard_id FROM review_events r WHERE r.user_id = ?
        ) u) AS cards_studied,
       (SELECT count(*) FROM study_attempts a JOIN study_sessions s ON s.id = a.session_id
          WHERE s.user_id = ? AND a.answered_at >= ?) AS answers_today,
       (SELECT count(*) FROM review_events r WHERE r.user_id = ? AND r.reviewed_at >= ?) AS reviews_today,
       (SELECT count(*) FROM review_events r WHERE r.user_id = ?) AS total_reviews,
       (SELECT count(*) FROM study_attempts a JOIN study_sessions s ON s.id = a.session_id WHERE s.user_id = ?) AS total_answers`,
    [userId, userId, userId, startOfDay, userId, startOfDay, userId, userId],
  );
  return {
    cardsStudied: num(row?.cards_studied),
    answersToday: num(row?.answers_today),
    reviewsToday: num(row?.reviews_today),
    totalReviews: num(row?.total_reviews),
    totalAnswers: num(row?.total_answers),
  };
}

/** Cards that have graduated to long-term review, over time (for the progress chart). */
export async function reviewStateCounts(db: SqlDriver, userId: Id) {
  const rows = await db.select<{ fsrs_state: number; n: number }>(
    'SELECT fsrs_state, count(*) AS n FROM card_progress WHERE user_id = ? AND scheduling_state IS NOT NULL GROUP BY fsrs_state',
    [userId],
  );
  const out = { new: 0, learning: 0, review: 0, relearning: 0 };
  for (const r of rows) {
    const s = num(r.fsrs_state);
    if (s === 0) out.new += num(r.n);
    else if (s === 1) out.learning += num(r.n);
    else if (s === 2) out.review += num(r.n);
    else out.relearning += num(r.n);
  }
  return out;
}
