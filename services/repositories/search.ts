import type { Id } from '@/domain/models';
import type { SqlDriver } from '@/services/db/driver';

export interface SetHit {
  id: Id;
  title: string;
  description: string;
  cardCount: number;
  ownerName: string;
}

export interface CardHit {
  id: Id;
  setId: Id;
  setTitle: string;
  front: string;
  back: string;
}

export interface SearchResults {
  sets: SetHit[];
  cards: CardHit[];
}

/** Split user input into safe search tokens (letters/numbers only). */
export function searchTokens(query: string): string[] {
  return (query.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
}

/** FTS5 query: every token must prefix-match, tokens are quoted so no syntax leaks through. */
export function fts5Query(tokens: readonly string[]): string {
  return tokens.map((t) => `"${t}"*`).join(' ');
}

/** Postgres tsquery: prefix match on every token. */
export function tsQuery(tokens: readonly string[]): string {
  return tokens.map((t) => `${t.toLowerCase()}:*`).join(' & ');
}

const VISIBLE = "s.deleted_at IS NULL AND (s.owner_id = ? OR s.visibility = 'shared')";

export async function search(
  db: SqlDriver,
  userId: Id,
  query: string,
  limit = 20,
): Promise<SearchResults> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return { sets: [], cards: [] };
  const tagLike = `%${tokens.join(' ').toLowerCase()}%`;

  const setMatch =
    db.dialect === 'postgres'
      ? "s.search @@ to_tsquery('simple', ?)"
      : 's.seq IN (SELECT rowid FROM sets_fts WHERE sets_fts MATCH ?)';
  const cardMatch =
    db.dialect === 'postgres'
      ? "f.search @@ to_tsquery('simple', ?)"
      : 'f.seq IN (SELECT rowid FROM cards_fts WHERE cards_fts MATCH ?)';
  const q = db.dialect === 'postgres' ? tsQuery(tokens) : fts5Query(tokens);

  const [sets, cards] = await Promise.all([
    db.select<{
      id: string;
      title: string;
      description: string;
      card_count: number;
      owner_name: string;
    }>(
      `SELECT s.id, s.title, s.description, coalesce(nullif(u.display_name, ''), u.username) AS owner_name,
              (SELECT count(*) FROM flashcards f WHERE f.set_id = s.id) AS card_count
       FROM study_sets s JOIN users u ON u.id = s.owner_id
       WHERE ${VISIBLE} AND (${setMatch} OR EXISTS (
         SELECT 1 FROM study_set_tags st JOIN tags t ON t.id = st.tag_id WHERE st.set_id = s.id AND lower(t.name) LIKE ?))
       ORDER BY s.owner_id = ? DESC, s.updated_at DESC LIMIT ?`,
      [userId, q, tagLike, userId, limit],
    ),
    db.select<{ id: string; set_id: string; title: string; front: string; back: string }>(
      `SELECT f.id, f.set_id, s.title, f.front, f.back
       FROM flashcards f JOIN study_sets s ON s.id = f.set_id
       WHERE ${VISIBLE} AND ${cardMatch}
       ORDER BY s.owner_id = ? DESC, s.updated_at DESC, f.position LIMIT ?`,
      [userId, q, userId, limit],
    ),
  ]);
  return {
    sets: sets.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      cardCount: Number(s.card_count),
      ownerName: s.owner_name,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      setId: c.set_id,
      setTitle: c.title,
      front: c.front,
      back: c.back,
    })),
  };
}
