import { z } from 'zod';

const id = z.string().min(1).max(64);
const ms = z.number().int().nonnegative();
const text = (max = 20_000) => z.string().max(max);
const ids = z.array(id).max(100_000);

export const folderRow = z.object({ id, name: text(200), createdAt: ms, updatedAt: ms });

export const setRow = z.object({
  id,
  folderId: id.nullable(),
  title: text(300),
  description: text(),
  visibility: z.enum(['private', 'shared']),
  tags: z.array(text(40)).max(50),
  createdAt: ms,
  updatedAt: ms,
  archivedAt: ms.nullable(),
  deletedAt: ms.nullable(),
});

export const cardRow = z.object({
  id,
  setId: id,
  front: text(),
  back: text(),
  explanation: text(),
  position: z.number().finite(),
  acceptedAnswers: z.array(text(500)).max(50),
  media: z
    .array(
      z.object({
        side: z.enum(['front', 'back']),
        path: z.string().regex(/^[0-9a-f-]{1,64}\.(png|jpe?g|gif|webp|avif)$/i),
        mimeType: text(100),
      }),
    )
    .max(2),
  createdAt: ms,
  updatedAt: ms,
});

export const progressRow = z.object({
  cardId: id,
  starred: z.boolean(),
  known: z.boolean().nullable(),
  reviewCount: z.number().int().min(0),
  lapses: z.number().int().min(0),
  fsrsState: z.number().int().min(0).max(3),
  stability: z.number(),
  difficulty: z.number(),
  lastReviewedAt: ms.nullable(),
  nextReviewAt: ms.nullable(),
  schedulingState: text(2000).nullable(),
  updatedAt: ms,
});

export const reviewRow = z.object({
  id,
  cardId: id,
  reviewedAt: ms,
  rating: z.number().int().min(1).max(4),
  responseTimeMs: z.number().int().nullable(),
  scheduledDays: z.number().nullable(),
  fsrsStateBefore: z.number().int().nullable(),
});

export const syncRows = z.object({
  folders: z.array(folderRow).max(10_000),
  sets: z.array(setRow).max(10_000),
  cards: z.array(cardRow).max(100_000),
  progress: z.array(progressRow).max(100_000),
  reviews: z.array(reviewRow).max(500_000),
});

export const tombstone = z.object({
  entity: z.enum(['folder', 'set', 'card']),
  id,
  deletedAt: ms,
});

export const idSets = z.object({
  folders: ids,
  sets: ids,
  cards: ids,
  progress: ids,
  reviews: ids,
});

export const syncRequest = z.discriminatedUnion('op', [
  z.object({ op: z.literal('manifest') }),
  z.object({
    op: z.literal('apply'),
    push: syncRows,
    tombstones: z.array(tombstone).max(100_000),
    pull: idSets,
  }),
]);

export type FolderRow = z.infer<typeof folderRow>;
export type SetRow = z.infer<typeof setRow>;
export type CardRow = z.infer<typeof cardRow>;
export type ProgressRow = z.infer<typeof progressRow>;
export type ReviewRow = z.infer<typeof reviewRow>;
export type SyncRows = z.infer<typeof syncRows>;
export type SyncRequest = z.infer<typeof syncRequest>;

export interface ApplyReport {
  written: number;
  skipped: number;
  deleted: number;
}

export interface ApplyResponse {
  rows: SyncRows;
  report: ApplyReport;
}

export function emptyRows(): SyncRows {
  return { folders: [], sets: [], cards: [], progress: [], reviews: [] };
}
