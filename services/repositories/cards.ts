import type { CardMedia, CardSide, Flashcard, Id, StudyCard } from '@/domain/models';
import { newId, now } from '@/lib/id';
import type { SqlDriver, Stmt } from '@/services/db/driver';
import { stmt } from '@/services/db/driver';

interface CardRow {
  id: string;
  set_id: string;
  front: string;
  back: string;
  explanation: string;
  position: number;
  created_at: number;
  updated_at: number;
}

export interface CardDraft {
  front: string;
  back: string;
  explanation?: string;
  acceptedAnswers?: string[];
}

function cleanAnswers(answers: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of answers ?? []) {
    const t = a.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

function answerStatements(cardId: Id, answers: readonly string[] | undefined): Stmt[] {
  return cleanAnswers(answers).map((a, i) =>
    stmt(
      'INSERT INTO accepted_answers (id, flashcard_id, answer, position) VALUES (?, ?, ?, ?)',
      newId(),
      cardId,
      a,
      i,
    ),
  );
}

export async function listCards(db: SqlDriver, setId: Id): Promise<Flashcard[]> {
  const [rows, answers, media] = await Promise.all([
    db.select<CardRow>('SELECT * FROM flashcards WHERE set_id = ? ORDER BY position, created_at', [
      setId,
    ]),
    db.select<{ flashcard_id: string; answer: string }>(
      'SELECT a.flashcard_id, a.answer FROM accepted_answers a JOIN flashcards f ON f.id = a.flashcard_id WHERE f.set_id = ? ORDER BY a.flashcard_id, a.position',
      [setId],
    ),
    db.select<{
      id: string;
      flashcard_id: string;
      side: CardSide;
      relative_path: string;
      mime_type: string;
    }>(
      'SELECT m.* FROM card_media m JOIN flashcards f ON f.id = m.flashcard_id WHERE f.set_id = ? ORDER BY m.created_at',
      [setId],
    ),
  ]);
  const answersBy = new Map<string, string[]>();
  for (const a of answers)
    answersBy.set(a.flashcard_id, [...(answersBy.get(a.flashcard_id) ?? []), a.answer]);
  const mediaBy = new Map<string, CardMedia[]>();
  for (const m of media) {
    mediaBy.set(m.flashcard_id, [
      ...(mediaBy.get(m.flashcard_id) ?? []),
      {
        id: m.id,
        flashcardId: m.flashcard_id,
        side: m.side,
        relativePath: m.relative_path,
        mimeType: m.mime_type,
      },
    ]);
  }
  return rows.map((r) => ({
    id: r.id,
    setId: r.set_id,
    front: r.front,
    back: r.back,
    explanation: r.explanation,
    position: Number(r.position),
    acceptedAnswers: answersBy.get(r.id) ?? [],
    media: mediaBy.get(r.id) ?? [],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }));
}

export function toStudyCard(c: Flashcard): StudyCard {
  return {
    id: c.id,
    front: c.front,
    back: c.back,
    explanation: c.explanation,
    acceptedAnswers: c.acceptedAnswers,
  };
}

async function maxPosition(db: SqlDriver, setId: Id): Promise<number> {
  const [row] = await db.select<{ p: number | null }>(
    'SELECT max(position) AS p FROM flashcards WHERE set_id = ?',
    [setId],
  );
  return Number(row?.p ?? 0);
}

export function insertCardStatements(
  setId: Id,
  cardId: Id,
  draft: CardDraft,
  position: number,
  at: number,
): Stmt[] {
  return [
    stmt(
      'INSERT INTO flashcards (id, set_id, front, back, explanation, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      cardId,
      setId,
      draft.front,
      draft.back,
      draft.explanation ?? '',
      position,
      at,
      at,
    ),
    ...answerStatements(cardId, draft.acceptedAnswers),
  ];
}

const touchSet = (setId: Id, at: number) =>
  stmt('UPDATE study_sets SET updated_at = ? WHERE id = ?', at, setId);

/**
 * Add a card. With `afterCardId` it is placed directly after that card
 * (fractional positions keep this a single-row write); otherwise at the end.
 */
export async function createCard(
  db: SqlDriver,
  setId: Id,
  draft: CardDraft,
  afterCardId?: Id,
  id: Id = newId(),
): Promise<Id> {
  const at = now();
  let position: number;
  if (afterCardId) {
    const rows = await db.select<{ position: number }>(
      `SELECT position FROM flashcards WHERE set_id = ? AND position >= (SELECT position FROM flashcards WHERE id = ?)
       ORDER BY position LIMIT 2`,
      [setId, afterCardId],
    );
    const a = Number(rows[0]?.position ?? (await maxPosition(db, setId)));
    position = rows[1] ? (a + Number(rows[1].position)) / 2 : a + 1;
  } else {
    position = (await maxPosition(db, setId)) + 1;
  }
  await db.batch([...insertCardStatements(setId, id, draft, position, at), touchSet(setId, at)]);
  return id;
}

/** Append many cards in one transaction (import, paste). */
export async function insertCards(
  db: SqlDriver,
  setId: Id,
  drafts: readonly CardDraft[],
): Promise<Id[]> {
  const at = now();
  const start = await maxPosition(db, setId);
  const ids = drafts.map(() => newId());
  const statements = drafts.flatMap((d, i) =>
    insertCardStatements(setId, ids[i], d, start + i + 1, at),
  );
  await db.batch([...statements, touchSet(setId, at)]);
  return ids;
}

export async function updateCard(
  db: SqlDriver,
  id: Id,
  patch: Partial<Pick<Flashcard, 'front' | 'back' | 'explanation' | 'acceptedAnswers'>>,
): Promise<void> {
  const at = now();
  const statements: Stmt[] = [];
  const cols: string[] = [];
  const params: (string | number)[] = [];
  for (const key of ['front', 'back', 'explanation'] as const) {
    if (patch[key] !== undefined) {
      cols.push(`${key} = ?`);
      params.push(patch[key] as string);
    }
  }
  cols.push('updated_at = ?');
  params.push(at, id);
  statements.push({ sql: `UPDATE flashcards SET ${cols.join(', ')} WHERE id = ?`, params });
  if (patch.acceptedAnswers !== undefined) {
    statements.push(
      stmt('DELETE FROM accepted_answers WHERE flashcard_id = ?', id),
      ...answerStatements(id, patch.acceptedAnswers),
    );
  }
  statements.push(
    stmt(
      'UPDATE study_sets SET updated_at = ? WHERE id = (SELECT set_id FROM flashcards WHERE id = ?)',
      at,
      id,
    ),
  );
  await db.batch(statements);
}

/** Set ids owning these cards (for authorization). */
export async function setIdsForCards(db: SqlDriver, ids: readonly Id[]): Promise<Id[]> {
  if (ids.length === 0) return [];
  const rows = await db.select<{ set_id: string }>(
    `SELECT DISTINCT set_id FROM flashcards WHERE id IN (${ids.map(() => '?').join(',')})`,
    [...ids],
  );
  return rows.map((r) => r.set_id);
}

export async function deleteCards(db: SqlDriver, ids: readonly Id[]): Promise<void> {
  if (ids.length === 0) return;
  const at = now();
  await db.batch([
    stmt(
      `UPDATE study_sets SET updated_at = ? WHERE id IN (SELECT set_id FROM flashcards WHERE id IN (${ids.map(() => '?').join(',')}))`,
      at,
      ...ids,
    ),
    ...ids.map((id) => stmt('DELETE FROM flashcards WHERE id = ?', id)),
  ]);
}

/** Persist a new order for the whole set (drag-and-drop). */
export async function reorderCards(
  db: SqlDriver,
  setId: Id,
  orderedIds: readonly Id[],
): Promise<void> {
  await db.batch([
    ...orderedIds.map((id, i) =>
      stmt('UPDATE flashcards SET position = ? WHERE id = ? AND set_id = ?', i + 1, id, setId),
    ),
    touchSet(setId, now()),
  ]);
}

export async function duplicateCard(db: SqlDriver, id: Id): Promise<Id> {
  const [card] = await db.select<CardRow>('SELECT * FROM flashcards WHERE id = ?', [id]);
  if (!card) throw new Error('Card not found');
  const answers = await db.select<{ answer: string }>(
    'SELECT answer FROM accepted_answers WHERE flashcard_id = ?',
    [id],
  );
  return createCard(
    db,
    card.set_id,
    {
      front: card.front,
      back: card.back,
      explanation: card.explanation,
      acceptedAnswers: answers.map((a) => a.answer),
    },
    id,
  );
}

/** Swap front and back for the given cards (bulk edit). */
export async function swapSides(db: SqlDriver, ids: readonly Id[]): Promise<void> {
  const at = now();
  await db.batch(
    ids.map((id) =>
      stmt('UPDATE flashcards SET front = back, back = front, updated_at = ? WHERE id = ?', at, id),
    ),
  );
}

export async function addCardMedia(
  db: SqlDriver,
  flashcardId: Id,
  side: CardSide,
  relativePath: string,
  mimeType: string,
): Promise<Id> {
  const id = newId();
  await db.batch([
    stmt('DELETE FROM card_media WHERE flashcard_id = ? AND side = ?', flashcardId, side),
    stmt(
      'INSERT INTO card_media (id, flashcard_id, side, relative_path, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      flashcardId,
      side,
      relativePath,
      mimeType,
      now(),
    ),
  ]);
  return id;
}

export async function removeCardMedia(
  db: SqlDriver,
  flashcardId: Id,
  side: CardSide,
): Promise<void> {
  await db.execute('DELETE FROM card_media WHERE flashcard_id = ? AND side = ?', [
    flashcardId,
    side,
  ]);
}

/** Is any card still using this media file? (files are shared by duplicated cards) */
export async function isMediaReferenced(db: SqlDriver, relativePath: string): Promise<boolean> {
  const rows = await db.select('SELECT 1 FROM card_media WHERE relative_path = ? LIMIT 1', [
    relativePath,
  ]);
  return rows.length > 0;
}
