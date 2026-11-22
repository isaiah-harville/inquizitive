import type { Id } from '@/domain/models';
import { countIds, type Manifest, planSync, type SyncPlan } from '@/domain/sync';
import type { SqlDriver } from '@/services/db/driver';
import { type ApplyResponse, emptyRows, type SyncRequest, syncRequest } from './rows';
import { applyRows, applyTombstones, buildManifest, exportRows } from './store';

/** How a device reaches its server. */
export interface SyncTransport {
  manifest(): Promise<Manifest>;
  apply(req: Extract<SyncRequest, { op: 'apply' }>): Promise<ApplyResponse>;
  uploadMedia(name: string, bytes: Uint8Array): Promise<void>;
  downloadMedia(name: string): Promise<Uint8Array | null>;
}

/** Image files on this device. */
export interface MediaStore {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  deletedHere: number;
  deletedThere: number;
  skipped: number;
  missingMedia: string[];
  at: number;
}

/** The server side of sync: answer a manifest or apply request for one user. */
export async function handleSyncRequest(
  db: SqlDriver,
  userId: Id,
  body: unknown,
): Promise<Manifest | ApplyResponse> {
  const req = syncRequest.parse(body);
  if (req.op === 'manifest') return buildManifest(db, userId);
  const report = await applyRows(db, userId, req.push);
  report.deleted = await applyTombstones(db, userId, req.tombstones);
  return { rows: await exportRows(db, userId, req.pull), report };
}

export async function runSync(
  db: SqlDriver,
  localUserId: Id,
  transport: SyncTransport,
  media: MediaStore,
  clock: () => number = Date.now,
): Promise<SyncReport & { plan: SyncPlan }> {
  const [local, remote] = await Promise.all([buildManifest(db, localUserId), transport.manifest()]);
  const plan = planSync(local, remote);
  const push = countIds(plan.push) ? await exportRows(db, localUserId, plan.push) : emptyRows();

  const missingMedia: string[] = [];
  for (const name of new Set(push.cards.flatMap((c) => c.media.map((m) => m.path)))) {
    const bytes = await media.read(name);
    if (bytes) await transport.uploadMedia(name, bytes);
    else missingMedia.push(name);
  }

  const response = await transport.apply({
    op: 'apply',
    push,
    tombstones: plan.pushTombstones,
    pull: plan.pull,
  });

  for (const name of new Set(response.rows.cards.flatMap((c) => c.media.map((m) => m.path)))) {
    if (await media.read(name)) continue;
    const bytes = await transport.downloadMedia(name);
    if (bytes) await media.write(name, bytes);
    else missingMedia.push(name);
  }
  const pulled = await applyRows(db, localUserId, response.rows);
  const deletedHere = await applyTombstones(db, localUserId, plan.applyTombstones);

  return {
    plan,
    pushed: response.report.written,
    pulled: pulled.written,
    deletedHere,
    deletedThere: response.report.deleted,
    skipped: response.report.skipped + pulled.skipped,
    missingMedia,
    at: clock(),
  };
}
