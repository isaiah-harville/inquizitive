import type { Id, QuestionType, StudyMode, StudySession } from '@/domain/models';
import { newId, now } from '@/lib/id';
import type { SqlDriver, Stmt } from '@/services/db/driver';
import { stmt } from '@/services/db/driver';
import { touchStudiedStatement } from './sets';
import { num, numOrNull } from './sql';

interface SessionRow {
  id: string;
  set_id: string | null;
  mode: StudyMode;
  started_at: number;
  updated_at: number;
  completed_at: number | null;
  session_state: string;
}

function mapSession<S>(r: SessionRow): StudySession<S> {
  let state: S;
  try {
    state = JSON.parse(r.session_state) as S;
  } catch {
    state = {} as S;
  }
  return {
    id: r.id,
    setId: r.set_id,
    mode: r.mode,
    startedAt: num(r.started_at),
    updatedAt: num(r.updated_at),
    completedAt: numOrNull(r.completed_at),
    state,
  };
}

/** Most recent unfinished session for this user/set/mode (to resume). */
export async function findActiveSession<S>(
  db: SqlDriver,
  userId: Id,
  setId: Id,
  mode: StudyMode,
): Promise<StudySession<S> | null> {
  const [row] = await db.select<SessionRow>(
    `SELECT * FROM study_sessions WHERE user_id = ? AND set_id = ? AND mode = ? AND completed_at IS NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, setId, mode],
  );
  return row ? mapSession<S>(row) : null;
}

export async function createSession<S>(
  db: SqlDriver,
  userId: Id,
  setId: Id | null,
  mode: StudyMode,
  state: S,
): Promise<Id> {
  const id = newId();
  const at = now();
  const statements: Stmt[] = [
    // Starting fresh supersedes any older unfinished session of the same mode.
    stmt(
      'DELETE FROM study_sessions WHERE user_id = ? AND set_id = ? AND mode = ? AND completed_at IS NULL',
      userId,
      setId,
      mode,
    ),
    stmt(
      `INSERT INTO study_sessions (id, user_id, set_id, mode, started_at, updated_at, session_state)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      setId,
      mode,
      at,
      at,
      JSON.stringify(state),
    ),
  ];
  if (setId) statements.push(touchStudiedStatement(userId, setId, at));
  await db.batch(statements);
  return id;
}

export interface AttemptDraft {
  flashcardId: Id;
  questionType: QuestionType;
  response: string | null;
  correct: boolean;
  answeredAt?: number;
}

/**
 * Persist session state (and any new attempts) atomically. Called after every
 * answer so an interrupted session can be resumed exactly where it stopped.
 */
export async function saveSession<S>(
  db: SqlDriver,
  userId: Id,
  sessionId: Id,
  state: S,
  opts: { completed?: boolean; attempts?: AttemptDraft[] } = {},
): Promise<void> {
  const at = now();
  const statements: Stmt[] = [
    stmt(
      `UPDATE study_sessions SET session_state = ?, updated_at = ?, completed_at = ?
       WHERE id = ? AND user_id = ?`,
      JSON.stringify(state),
      at,
      opts.completed ? at : null,
      sessionId,
      userId,
    ),
    ...(opts.attempts ?? []).map((a) =>
      stmt(
        `INSERT INTO study_attempts (id, session_id, flashcard_id, question_type, response, correct, answered_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM study_sessions WHERE id = ? AND user_id = ?)`,
        newId(),
        sessionId,
        a.flashcardId,
        a.questionType,
        a.response,
        a.correct ? 1 : 0,
        a.answeredAt ?? at,
        sessionId,
        userId,
      ),
    ),
    stmt(
      `INSERT INTO set_activity (user_id, set_id, last_studied_at)
       SELECT ?, set_id, ? FROM study_sessions WHERE id = ? AND set_id IS NOT NULL
       ON CONFLICT (user_id, set_id) DO UPDATE SET last_studied_at = excluded.last_studied_at`,
      userId,
      at,
      sessionId,
    ),
  ];
  await db.batch(statements);
}

export async function discardSession(db: SqlDriver, userId: Id, sessionId: Id): Promise<void> {
  await db.execute('DELETE FROM study_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
}

export interface ResumableSession {
  id: Id;
  setId: Id;
  setTitle: string;
  mode: StudyMode;
  updatedAt: number;
}

/** Unfinished sessions for the "Continue studying" list. */
export async function resumableSessions(
  db: SqlDriver,
  userId: Id,
  limit = 5,
): Promise<ResumableSession[]> {
  const rows = await db.select<{
    id: string;
    set_id: string;
    title: string;
    mode: StudyMode;
    updated_at: number;
  }>(
    `SELECT ss.id, ss.set_id, s.title, ss.mode, ss.updated_at FROM study_sessions ss
     JOIN study_sets s ON s.id = ss.set_id AND s.deleted_at IS NULL
     WHERE ss.user_id = ? AND ss.completed_at IS NULL AND ss.mode IN ('flashcards', 'learn', 'test')
     ORDER BY ss.updated_at DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    setId: r.set_id,
    setTitle: r.title,
    mode: r.mode,
    updatedAt: num(r.updated_at),
  }));
}

export async function recordMatchTime(
  db: SqlDriver,
  userId: Id,
  setId: Id,
  pairCount: number,
  timeMs: number,
): Promise<{ previousBest: number | null; isBest: boolean }> {
  const previousBest = await bestMatchTime(db, userId, setId, pairCount);
  const at = now();
  await db.batch([
    stmt(
      'INSERT INTO match_records (id, user_id, set_id, pair_count, time_ms, achieved_at) VALUES (?, ?, ?, ?, ?, ?)',
      newId(),
      userId,
      setId,
      pairCount,
      Math.round(timeMs),
      at,
    ),
    touchStudiedStatement(userId, setId, at),
  ]);
  return { previousBest, isBest: previousBest === null || timeMs < previousBest };
}

export async function bestMatchTime(
  db: SqlDriver,
  userId: Id,
  setId: Id,
  pairCount: number,
): Promise<number | null> {
  const [row] = await db.select<{ best: number | null }>(
    'SELECT min(time_ms) AS best FROM match_records WHERE user_id = ? AND set_id = ? AND pair_count = ?',
    [userId, setId, pairCount],
  );
  return numOrNull(row?.best);
}
