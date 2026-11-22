import { z } from 'zod';
import type { User } from '@/domain/models';
import { ApiError, type ApiMethod, createCoreApi } from '@/services/api/core';
import { serverConfig } from './config';
import { serverDb } from './db';
import { blobStore, MEDIA_NAME } from './storage';

const id = z.string().min(1).max(64);
const ids = z.array(id).max(20_000);
const shortText = z.string().max(300);
const longText = z.string().max(20_000);
const mode = z.enum(['flashcards', 'learn', 'test', 'match', 'review']);
const visibility = z.enum(['private', 'shared']);
const json = z
  .unknown()
  .refine((v) => JSON.stringify(v ?? null).length <= 2_000_000, 'state too large');

const cardDraft = z.object({
  front: longText,
  back: longText,
  explanation: longText.optional(),
  acceptedAnswers: z.array(z.string().max(500)).max(50).optional(),
});

const setDraft = z.object({
  title: shortText,
  description: longText.optional(),
  folderId: id.nullable().optional(),
  tags: z.array(z.string().max(40)).max(50).optional(),
  visibility: visibility.optional(),
});

const listOpts = z
  .object({
    scope: z.enum(['mine', 'shared', 'studied']).optional(),
    folderId: id.nullable().optional(),
    sort: z.enum(['title', 'created', 'updated', 'studied']).optional(),
    archived: z.enum(['exclude', 'only', 'include']).optional(),
    tag: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .optional();

const schedulingCard = z
  .object({
    due: z.number(),
    stability: z.number(),
    difficulty: z.number(),
    scheduledDays: z.number(),
    learningSteps: z.number(),
    reps: z.number(),
    lapses: z.number(),
    state: z.number(),
    lastReview: z.number().nullable(),
  })
  .nullable();

const attempts = z
  .array(
    z.object({
      flashcardId: id,
      questionType: z.enum(['multiple_choice', 'written', 'true_false', 'flashcard', 'matching']),
      response: z.string().max(5000).nullable(),
      correct: z.boolean(),
      answeredAt: z.number().optional(),
    }),
  )
  .max(500);

const ARGS: Record<ApiMethod, z.ZodType<unknown[]>> = {
  me: z.tuple([]),
  listSets: z.tuple([listOpts]),
  getSet: z.tuple([id]),
  createSet: z.tuple([setDraft]),
  updateSet: z.tuple([
    id,
    z.object({
      title: shortText.optional(),
      description: longText.optional(),
      folderId: id.nullable().optional(),
      visibility: visibility.optional(),
    }),
  ]),
  setTags: z.tuple([id, z.array(z.string().max(40)).max(50)]),
  duplicateSet: z.tuple([id]),
  archiveSet: z.tuple([id, z.boolean()]),
  trashSet: z.tuple([id]),
  restoreSet: z.tuple([id]),
  purgeSet: z.tuple([id]),
  emptyTrash: z.tuple([]),
  listTrash: z.tuple([]),
  listTags: z.tuple([]),
  touchOpened: z.tuple([id]),
  listFolders: z.tuple([]),
  createFolder: z.tuple([shortText]),
  renameFolder: z.tuple([id, shortText]),
  deleteFolder: z.tuple([id]),
  createCard: z.tuple([id, cardDraft, id.optional(), z.string().uuid().optional()]),
  insertCards: z.tuple([id, z.array(cardDraft).max(20_000)]),
  updateCard: z.tuple([id, cardDraft.partial()]),
  deleteCards: z.tuple([ids]),
  reorderCards: z.tuple([id, ids]),
  duplicateCard: z.tuple([id]),
  swapSides: z.tuple([ids]),
  setCardMedia: z.tuple([
    id,
    z.enum(['front', 'back']),
    z.string().regex(MEDIA_NAME).nullable(),
    z.string().max(100).optional(),
  ]),
  setStarred: z.tuple([id, z.boolean()]),
  setKnown: z.tuple([ids, z.boolean().nullable()]),
  resetProgress: z.tuple([id]),
  recordReview: z.tuple([
    id,
    z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    z.number().nullable().optional(),
  ]),
  reviewQueue: z.tuple([
    z
      .object({
        setId: id.optional(),
        limit: z.number().int().max(1000).optional(),
        newLimit: z.number().int().max(500).optional(),
      })
      .optional(),
  ]),
  previewReview: z.tuple([schedulingCard]),
  dueCounts: z.tuple([z.number()]),
  findActiveSession: z.tuple([id, mode]),
  createSession: z.tuple([id, mode, json]),
  saveSession: z.tuple([
    id,
    json,
    z.object({ completed: z.boolean().optional(), attempts: attempts.optional() }).optional(),
  ]),
  discardSession: z.tuple([id]),
  resumableSessions: z.tuple([z.number().int().max(50).optional()]),
  recordMatchTime: z.tuple([id, z.number().int().min(1).max(50), z.number().min(0)]),
  bestMatchTime: z.tuple([id, z.number().int().min(1).max(50)]),
  getStats: z.tuple([
    z.object({
      tzOffsetMs: z.number(),
      days: z.number().int().min(1).max(400),
      startOfDay: z.number(),
      endOfDay: z.number(),
    }),
  ]),
  search: z.tuple([z.string().max(200), z.number().int().max(100).optional()]),
  getSettings: z.tuple([]),
  setSetting: z.tuple([z.string().max(64), json]),
  exportLibrary: z.tuple([
    z.object({ setIds: ids.optional(), includeProgress: z.boolean().optional() }).optional(),
  ]),
  importLibrary: z.tuple([
    z.unknown(),
    z.object({ includeProgress: z.boolean().optional() }).optional(),
  ]),
  listUsers: z.tuple([]),
  setUserRole: z.tuple([id, z.enum(['admin', 'member'])]),
  setUserDisabled: z.tuple([id, z.boolean()]),
  updateProfile: z.tuple([
    z.object({
      displayName: shortText.optional(),
      email: z.string().email().max(200).nullable().optional(),
    }),
  ]),
};

export function isApiMethod(m: unknown): m is ApiMethod {
  return typeof m === 'string' && Object.hasOwn(ARGS, m);
}

export async function dispatch(user: User, method: ApiMethod, rawArgs: unknown): Promise<unknown> {
  const parsed = ARGS[method].safeParse(rawArgs);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(
      `Invalid arguments for ${method}: ${issue.path.join('.')} ${issue.message}`,
      400,
    );
  }
  const db = await serverDb();
  const store = await blobStore();
  const api = createCoreApi(db, user, {
    deleteMedia: (path) => store.delete(path),
    requestRetention: serverConfig().FSRS_RETENTION,
  });
  const fn = api[method] as (...args: unknown[]) => Promise<unknown>;
  return fn(...parsed.data);
}
