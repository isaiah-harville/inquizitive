import type { Id } from '@/domain/models';

export type SyncEntity = 'folder' | 'set' | 'card';

export interface Tombstone {
  entity: SyncEntity;
  id: Id;
  deletedAt: number;
}

/** What one side holds: entity id → updated_at, plus review ids and deletions. */
export interface Manifest {
  folders: Record<Id, number>;
  sets: Record<Id, number>;
  cards: Record<Id, number>;
  progress: Record<Id, number>;
  reviews: Id[];
  tombstones: Tombstone[];
}

export interface IdSets {
  folders: Id[];
  sets: Id[];
  cards: Id[];
  progress: Id[];
  reviews: Id[];
}

export interface SyncPlan {
  push: IdSets;
  pull: IdSets;
  /** Local deletions the server should apply. */
  pushTombstones: Tombstone[];
  /** Server deletions to apply locally. */
  applyTombstones: Tombstone[];
}

export function emptyIdSets(): IdSets {
  return { folders: [], sets: [], cards: [], progress: [], reviews: [] };
}

export function emptyManifest(): Manifest {
  return { folders: {}, sets: {}, cards: {}, progress: {}, reviews: [], tombstones: [] };
}

const ENTITY_KEYS: Record<SyncEntity, 'folders' | 'sets' | 'cards'> = {
  folder: 'folders',
  set: 'sets',
  card: 'cards',
};

function tombstoneIndex(list: readonly Tombstone[]) {
  const byKey = new Map<string, Tombstone>();
  for (const t of list) byKey.set(`${t.entity}:${t.id}`, t);
  return byKey;
}

/**
 * Decide what to send and fetch. Last writer wins per row by `updated_at`;
 * a deletion beats any edit made before it.
 */
export function planSync(local: Manifest, remote: Manifest): SyncPlan {
  const plan: SyncPlan = {
    push: emptyIdSets(),
    pull: emptyIdSets(),
    pushTombstones: [],
    applyTombstones: [],
  };
  const localDead = tombstoneIndex(local.tombstones);
  const remoteDead = tombstoneIndex(remote.tombstones);

  for (const entity of ['folder', 'set', 'card'] as const) {
    const key = ENTITY_KEYS[entity];
    const mine = local[key];
    const theirs = remote[key];
    for (const [id, updated] of Object.entries(mine)) {
      const other = theirs[id];
      if (other === undefined) {
        const dead = remoteDead.get(`${entity}:${id}`);
        if (dead && dead.deletedAt >= updated) plan.applyTombstones.push(dead);
        else plan.push[key].push(id);
      } else if (updated > other) plan.push[key].push(id);
      else if (other > updated) plan.pull[key].push(id);
    }
    for (const [id, updated] of Object.entries(theirs)) {
      if (id in mine) continue;
      const dead = localDead.get(`${entity}:${id}`);
      if (dead && dead.deletedAt >= updated) plan.pushTombstones.push(dead);
      else plan.pull[key].push(id);
    }
  }

  for (const [id, updated] of Object.entries(local.progress)) {
    const other = remote.progress[id];
    if (other === undefined || updated > other) plan.push.progress.push(id);
    else if (other > updated) plan.pull.progress.push(id);
  }
  for (const id of Object.keys(remote.progress)) {
    if (!(id in local.progress)) plan.pull.progress.push(id);
  }

  const remoteReviews = new Set(remote.reviews);
  const localReviews = new Set(local.reviews);
  plan.push.reviews = local.reviews.filter((id) => !remoteReviews.has(id));
  plan.pull.reviews = remote.reviews.filter((id) => !localReviews.has(id));
  return plan;
}

export function countIds(ids: IdSets): number {
  return (
    ids.folders.length +
    ids.sets.length +
    ids.cards.length +
    ids.progress.length +
    ids.reviews.length
  );
}
