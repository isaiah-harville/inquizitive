import type { Id, SetSort, StudySet, StudySetSummary, Visibility } from '@/domain/models';
import { newId, now } from '@/lib/id';
import type { SqlDriver, SqlParam, Stmt } from '@/services/db/driver';
import { stmt } from '@/services/db/driver';
import { listAgg, num, numOrNull, placeholders, splitList } from './sql';

/** Days a trashed set is kept before it is purged. */
export const TRASH_RETENTION_DAYS = 30;

interface SetRow {
  id: string;
  owner_id: string;
  owner_name: string | null;
  folder_id: string | null;
  title: string;
  description: string;
  visibility: Visibility;
  created_at: number;
  updated_at: number;
  last_studied_at: number | null;
  archived_at: number | null;
  deleted_at: number | null;
}

interface SummaryRow extends SetRow {
  card_count: number;
  learned_count: number;
  due_count: number;
  tags: string | null;
}

function mapSet(r: SetRow): StudySet {
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name ?? '',
    folderId: r.folder_id,
    title: r.title,
    description: r.description,
    visibility: r.visibility,
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
    lastStudiedAt: numOrNull(r.last_studied_at),
    archivedAt: numOrNull(r.archived_at),
    deletedAt: numOrNull(r.deleted_at),
  };
}

function mapSummary(r: SummaryRow): StudySetSummary {
  return {
    ...mapSet(r),
    cardCount: num(r.card_count),
    learnedCount: num(r.learned_count),
    dueCount: num(r.due_count),
    tags: splitList(r.tags).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Set rows with per-user aggregates. Parameters (in order): userId (progress),
 * userId (due), now, userId (activity).
 */
function summarySelect(db: SqlDriver): string {
  return `
SELECT s.id, s.owner_id, coalesce(nullif(u.display_name, ''), u.username) AS owner_name, s.folder_id,
       s.title, s.description, s.visibility, s.created_at, s.updated_at, a.last_studied_at,
       s.archived_at, s.deleted_at,
       (SELECT count(*) FROM flashcards f WHERE f.set_id = s.id) AS card_count,
       (SELECT count(*) FROM flashcards f JOIN card_progress p ON p.flashcard_id = f.id AND p.user_id = ?
          WHERE f.set_id = s.id AND (p.known = 1 OR p.fsrs_state = 2)) AS learned_count,
       (SELECT count(*) FROM flashcards f JOIN card_progress p ON p.flashcard_id = f.id AND p.user_id = ?
          WHERE f.set_id = s.id AND p.next_review_at IS NOT NULL AND p.next_review_at <= ?) AS due_count,
       (SELECT ${listAgg(db.dialect, 't.name')} FROM study_set_tags st JOIN tags t ON t.id = st.tag_id
          WHERE st.set_id = s.id) AS tags
FROM study_sets s
JOIN users u ON u.id = s.owner_id
LEFT JOIN set_activity a ON a.set_id = s.id AND a.user_id = ?`;
}

const summaryParams = (userId: Id): SqlParam[] => [userId, userId, now(), userId];

const SORTS: Record<SetSort, string> = {
  title: 'lower(s.title) ASC',
  created: 's.created_at DESC',
  updated: 's.updated_at DESC',
  studied: 'coalesce(a.last_studied_at, 0) DESC, s.updated_at DESC',
};

export interface ListSetsOptions {
  /** "mine" = sets I own; "shared" = sets others shared with the instance; "studied" = anything I studied. */
  scope?: 'mine' | 'shared' | 'studied';
  /** undefined = any folder, null = unfiled only. Only meaningful for "mine". */
  folderId?: Id | null;
  sort?: SetSort;
  archived?: 'exclude' | 'only' | 'include';
  tag?: string;
  limit?: number;
}

export async function listSets(
  db: SqlDriver,
  userId: Id,
  opts: ListSetsOptions = {},
): Promise<StudySetSummary[]> {
  const where = ['s.deleted_at IS NULL'];
  const params: SqlParam[] = summaryParams(userId);
  const scope = opts.scope ?? 'mine';
  if (scope === 'mine') {
    where.push('s.owner_id = ?');
    params.push(userId);
  } else if (scope === 'shared') {
    where.push("s.owner_id <> ? AND s.visibility = 'shared'");
    params.push(userId);
  } else {
    where.push("a.last_studied_at IS NOT NULL AND (s.owner_id = ? OR s.visibility = 'shared')");
    params.push(userId);
  }
  if (opts.folderId === null) where.push('s.folder_id IS NULL');
  else if (opts.folderId !== undefined) {
    where.push('s.folder_id = ?');
    params.push(opts.folderId);
  }
  const archived = opts.archived ?? 'exclude';
  if (archived === 'exclude') where.push('s.archived_at IS NULL');
  if (archived === 'only') where.push('s.archived_at IS NOT NULL');
  if (opts.tag) {
    where.push(
      'EXISTS (SELECT 1 FROM study_set_tags st JOIN tags t ON t.id = st.tag_id WHERE st.set_id = s.id AND lower(t.name) = lower(?))',
    );
    params.push(opts.tag);
  }
  let sql = `${summarySelect(db)} WHERE ${where.join(' AND ')} ORDER BY ${SORTS[opts.sort ?? (scope === 'studied' ? 'studied' : 'updated')]}`;
  if (opts.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }
  const rows = await db.select<SummaryRow>(sql, params);
  return rows.map(mapSummary);
}

/** A single set as seen by `userId` (null if missing; visibility is checked by the API layer). */
export async function getSetSummary(
  db: SqlDriver,
  userId: Id,
  id: Id,
): Promise<StudySetSummary | null> {
  const [row] = await db.select<SummaryRow>(`${summarySelect(db)} WHERE s.id = ?`, [
    ...summaryParams(userId),
    id,
  ]);
  return row ? mapSummary(row) : null;
}

/** Ownership/visibility facts for authorization checks. */
export async function getSetAccess(
  db: SqlDriver,
  id: Id,
): Promise<{ ownerId: Id; visibility: Visibility; deleted: boolean } | null> {
  const [row] = await db.select<{
    owner_id: string;
    visibility: Visibility;
    deleted_at: number | null;
  }>('SELECT owner_id, visibility, deleted_at FROM study_sets WHERE id = ?', [id]);
  return row
    ? { ownerId: row.owner_id, visibility: row.visibility, deleted: row.deleted_at !== null }
    : null;
}

export interface SetDraft {
  title: string;
  description?: string;
  folderId?: Id | null;
  tags?: string[];
  visibility?: Visibility;
}

export function createSetStatements(id: Id, ownerId: Id, draft: SetDraft, at = now()): Stmt[] {
  return [
    stmt(
      `INSERT INTO study_sets (id, owner_id, folder_id, title, description, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ownerId,
      draft.folderId ?? null,
      draft.title.trim() || 'Untitled set',
      draft.description ?? '',
      draft.visibility ?? 'private',
      at,
      at,
    ),
    ...tagStatements(id, draft.tags ?? []),
  ];
}

export async function createSet(db: SqlDriver, ownerId: Id, draft: SetDraft): Promise<Id> {
  const id = newId();
  await db.batch(createSetStatements(id, ownerId, draft));
  return id;
}

export type SetPatch = Partial<Pick<StudySet, 'title' | 'description' | 'folderId' | 'visibility'>>;

export async function updateSet(db: SqlDriver, id: Id, patch: SetPatch): Promise<void> {
  const cols: string[] = [];
  const params: SqlParam[] = [];
  if (patch.title !== undefined) {
    cols.push('title = ?');
    params.push(patch.title.trim() || 'Untitled set');
  }
  if (patch.description !== undefined) {
    cols.push('description = ?');
    params.push(patch.description);
  }
  if (patch.folderId !== undefined) {
    cols.push('folder_id = ?');
    params.push(patch.folderId);
  }
  if (patch.visibility !== undefined) {
    cols.push('visibility = ?');
    params.push(patch.visibility);
  }
  if (cols.length === 0) return;
  cols.push('updated_at = ?');
  params.push(now(), id);
  await db.execute(`UPDATE study_sets SET ${cols.join(', ')} WHERE id = ?`, params);
}

export function normalizeTags(names: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

export function tagStatements(setId: Id, names: readonly string[]): Stmt[] {
  return normalizeTags(names).flatMap((name) => [
    stmt(
      'INSERT INTO tags (id, name) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM tags WHERE lower(name) = lower(?))',
      newId(),
      name,
      name,
    ),
    stmt(
      `INSERT INTO study_set_tags (set_id, tag_id) SELECT ?, id FROM tags WHERE lower(name) = lower(?)
       ON CONFLICT DO NOTHING`,
      setId,
      name,
    ),
  ]);
}

export const PRUNE_TAGS = stmt(
  'DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM study_set_tags)',
);

export async function setTags(db: SqlDriver, setId: Id, names: readonly string[]): Promise<void> {
  await db.batch([
    stmt('DELETE FROM study_set_tags WHERE set_id = ?', setId),
    ...tagStatements(setId, names),
    PRUNE_TAGS,
    stmt('UPDATE study_sets SET updated_at = ? WHERE id = ?', now(), setId),
  ]);
}

/** Tags in use on sets visible to `userId`. */
export async function listTags(
  db: SqlDriver,
  userId: Id,
): Promise<{ name: string; count: number }[]> {
  const rows = await db.select<{ name: string; count: number }>(
    `SELECT t.name AS name, count(s.id) AS count FROM tags t
     JOIN study_set_tags st ON st.tag_id = t.id
     JOIN study_sets s ON s.id = st.set_id AND s.deleted_at IS NULL AND (s.owner_id = ? OR s.visibility = 'shared')
     GROUP BY t.id, t.name ORDER BY lower(t.name)`,
    [userId],
  );
  return rows.map((r) => ({ name: r.name, count: num(r.count) }));
}

/** Copy a set (cards, answers, media references, tags) into `ownerId`'s library. Progress is not copied. */
export async function duplicateSet(
  db: SqlDriver,
  id: Id,
  ownerId: Id,
  titleSuffix = ' (copy)',
): Promise<Id> {
  const [set] = await db.select<SetRow>('SELECT * FROM study_sets WHERE id = ?', [id]);
  if (!set) throw new Error('Set not found');
  const [tags, cards, answers, media] = await Promise.all([
    db.select<{ name: string }>(
      'SELECT t.name FROM study_set_tags st JOIN tags t ON t.id = st.tag_id WHERE st.set_id = ?',
      [id],
    ),
    db.select<{ id: string; front: string; back: string; explanation: string; position: number }>(
      'SELECT id, front, back, explanation, position FROM flashcards WHERE set_id = ? ORDER BY position',
      [id],
    ),
    db.select<{ flashcard_id: string; answer: string; position: number }>(
      'SELECT a.flashcard_id, a.answer, a.position FROM accepted_answers a JOIN flashcards f ON f.id = a.flashcard_id WHERE f.set_id = ?',
      [id],
    ),
    db.select<{ flashcard_id: string; side: string; relative_path: string; mime_type: string }>(
      'SELECT m.flashcard_id, m.side, m.relative_path, m.mime_type FROM card_media m JOIN flashcards f ON f.id = m.flashcard_id WHERE f.set_id = ?',
      [id],
    ),
  ]);

  const newSetId = newId();
  const at = now();
  const idMap = new Map(cards.map((c) => [c.id, newId()]));
  const sameOwner = set.owner_id === ownerId;
  const statements: Stmt[] = [
    ...createSetStatements(
      newSetId,
      ownerId,
      {
        title: `${set.title}${titleSuffix}`,
        description: set.description,
        folderId: sameOwner ? set.folder_id : null,
        tags: tags.map((t) => t.name),
      },
      at,
    ),
    ...cards.map((c) =>
      stmt(
        'INSERT INTO flashcards (id, set_id, front, back, explanation, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        idMap.get(c.id) as string,
        newSetId,
        c.front,
        c.back,
        c.explanation,
        num(c.position),
        at,
        at,
      ),
    ),
    ...answers.map((a) =>
      stmt(
        'INSERT INTO accepted_answers (id, flashcard_id, answer, position) VALUES (?, ?, ?, ?)',
        newId(),
        idMap.get(a.flashcard_id) as string,
        a.answer,
        num(a.position),
      ),
    ),
    ...media.map((m) =>
      stmt(
        'INSERT INTO card_media (id, flashcard_id, side, relative_path, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        newId(),
        idMap.get(m.flashcard_id) as string,
        m.side,
        m.relative_path,
        m.mime_type,
        at,
      ),
    ),
  ];
  await db.batch(statements);
  return newSetId;
}

export async function archiveSet(db: SqlDriver, id: Id, archived: boolean): Promise<void> {
  const at = now();
  await db.execute('UPDATE study_sets SET archived_at = ?, updated_at = ? WHERE id = ?', [
    archived ? at : null,
    at,
    id,
  ]);
}

/** Move to trash (recoverable for TRASH_RETENTION_DAYS). */
export async function trashSet(db: SqlDriver, id: Id): Promise<void> {
  const at = now();
  await db.execute('UPDATE study_sets SET deleted_at = ?, updated_at = ? WHERE id = ?', [
    at,
    at,
    id,
  ]);
}

export async function restoreSet(db: SqlDriver, id: Id): Promise<void> {
  await db.execute('UPDATE study_sets SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
    now(),
    id,
  ]);
}

export async function listTrash(db: SqlDriver, userId: Id): Promise<StudySetSummary[]> {
  const rows = await db.select<SummaryRow>(
    `${summarySelect(db)} WHERE s.deleted_at IS NOT NULL AND s.owner_id = ? ORDER BY s.deleted_at DESC`,
    [...summaryParams(userId), userId],
  );
  return rows.map(mapSummary);
}

/** Permanently delete sets (cards, progress and history cascade). Returns media paths that became unreferenced. */
export async function purgeSets(db: SqlDriver, ids: readonly Id[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const media = await db.select<{ relative_path: string }>(
    `SELECT DISTINCT m.relative_path FROM card_media m JOIN flashcards f ON f.id = m.flashcard_id
     WHERE f.set_id IN (${placeholders(ids.length)})`,
    [...ids],
  );
  await db.batch([
    stmt(`DELETE FROM study_sets WHERE id IN (${placeholders(ids.length)})`, ...ids),
    PRUNE_TAGS,
  ]);
  const orphans: string[] = [];
  for (const m of media) {
    const still = await db.select('SELECT 1 FROM card_media WHERE relative_path = ? LIMIT 1', [
      m.relative_path,
    ]);
    if (still.length === 0) orphans.push(m.relative_path);
  }
  return orphans;
}

/** Ids of trashed sets past retention (all users). */
export async function expiredTrash(db: SqlDriver, at = now()): Promise<Id[]> {
  const cutoff = at - TRASH_RETENTION_DAYS * 86_400_000;
  const rows = await db.select<{ id: string }>(
    'SELECT id FROM study_sets WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [cutoff],
  );
  return rows.map((r) => r.id);
}

function activityUpsert(
  column: 'last_opened_at' | 'last_studied_at',
  userId: Id,
  setId: Id,
  at: number,
): Stmt {
  return stmt(
    `INSERT INTO set_activity (user_id, set_id, ${column}) VALUES (?, ?, ?)
     ON CONFLICT (user_id, set_id) DO UPDATE SET ${column} = excluded.${column}`,
    userId,
    setId,
    at,
  );
}

export async function touchStudied(
  db: SqlDriver,
  userId: Id,
  setId: Id,
  at = now(),
): Promise<void> {
  await db.batch([activityUpsert('last_studied_at', userId, setId, at)]);
}

export async function touchOpened(db: SqlDriver, userId: Id, setId: Id, at = now()): Promise<void> {
  await db.batch([activityUpsert('last_opened_at', userId, setId, at)]);
}

export function touchStudiedStatement(userId: Id, setId: Id, at = now()): Stmt {
  return activityUpsert('last_studied_at', userId, setId, at);
}
