import type { Folder, Id } from '@/domain/models';
import { newId, now } from '@/lib/id';
import type { SqlDriver } from '@/services/db/driver';

interface FolderRow {
  id: string;
  owner_id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
  set_count?: number;
}

export interface FolderWithCount extends Folder {
  setCount: number;
}

export async function listFolders(db: SqlDriver, ownerId: Id): Promise<FolderWithCount[]> {
  const rows = await db.select<FolderRow>(
    `SELECT f.*, (SELECT count(*) FROM study_sets s WHERE s.folder_id = f.id AND s.deleted_at IS NULL AND s.archived_at IS NULL) AS set_count
     FROM folders f WHERE f.owner_id = ? ORDER BY lower(f.name)`,
    [ownerId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    ownerId: r.owner_id,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    setCount: Number(r.set_count ?? 0),
  }));
}

export async function createFolder(
  db: SqlDriver,
  ownerId: Id,
  name: string,
  parentId: Id | null = null,
): Promise<Id> {
  const id = newId();
  const at = now();
  await db.execute(
    'INSERT INTO folders (id, owner_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, ownerId, name.trim() || 'New folder', parentId, at, at],
  );
  return id;
}

export async function renameFolder(db: SqlDriver, id: Id, name: string): Promise<void> {
  await db.execute('UPDATE folders SET name = ?, updated_at = ? WHERE id = ?', [
    name.trim() || 'Folder',
    now(),
    id,
  ]);
}

/** Delete a folder; its sets become unfiled (they are never deleted with it). */
export async function deleteFolder(db: SqlDriver, id: Id): Promise<void> {
  await db.execute('DELETE FROM folders WHERE id = ?', [id]);
}

export async function getFolderOwner(db: SqlDriver, id: Id): Promise<Id | null> {
  const [row] = await db.select<{ owner_id: string }>('SELECT owner_id FROM folders WHERE id = ?', [
    id,
  ]);
  return row?.owner_id ?? null;
}
