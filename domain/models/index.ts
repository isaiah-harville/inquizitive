export type Id = string;
/** Unix epoch milliseconds. */
export type Millis = number;

export interface Folder {
  id: Id;
  ownerId: Id;
  name: string;
  parentId: Id | null;
  createdAt: Millis;
  updatedAt: Millis;
}

export type Visibility = 'private' | 'shared';

export interface StudySet {
  id: Id;
  ownerId: Id;
  /** Display name of the owner (useful for shared sets). */
  ownerName: string;
  folderId: Id | null;
  title: string;
  description: string;
  visibility: Visibility;
  createdAt: Millis;
  updatedAt: Millis;
  /** When the *current user* last studied this set. */
  lastStudiedAt: Millis | null;
  archivedAt: Millis | null;
  deletedAt: Millis | null;
}

export type Role = 'admin' | 'member';

export interface User {
  id: Id;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  authProvider: string;
}

/** Library list row: a set plus cheap aggregates. */
export interface StudySetSummary extends StudySet {
  cardCount: number;
  /** Cards marked known in flashcards or graduated to FSRS review. */
  learnedCount: number;
  /** Cards whose spaced-repetition review is due now. */
  dueCount: number;
  tags: string[];
}

export type CardSide = 'front' | 'back';

export interface CardMedia {
  id: Id;
  flashcardId: Id;
  side: CardSide;
  relativePath: string;
  mimeType: string;
}

export interface Flashcard {
  id: Id;
  setId: Id;
  front: string;
  back: string;
  explanation: string;
  position: number;
  acceptedAnswers: string[];
  media: CardMedia[];
  createdAt: Millis;
  updatedAt: Millis;
}

/** The minimum a study algorithm needs to know about a card. */
export interface StudyCard {
  id: Id;
  front: string;
  back: string;
  explanation?: string;
  acceptedAnswers?: string[];
}

export interface Tag {
  id: Id;
  name: string;
}

export enum FsrsState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

export enum ReviewRating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export interface CardProgress {
  flashcardId: Id;
  starred: boolean;
  /** Flashcard-mode marker: true = known, false = still learning, null = unmarked. */
  known: boolean | null;
  reviewCount: number;
  lapses: number;
  fsrsState: FsrsState;
  stability: number;
  difficulty: number;
  lastReviewedAt: Millis | null;
  nextReviewAt: Millis | null;
  schedulingState: string | null;
}

export type StudyMode = 'flashcards' | 'learn' | 'test' | 'match' | 'review';

export type QuestionType = 'multiple_choice' | 'written' | 'true_false' | 'flashcard' | 'matching';

export interface StudySession<S = unknown> {
  id: Id;
  setId: Id | null;
  mode: StudyMode;
  startedAt: Millis;
  updatedAt: Millis;
  completedAt: Millis | null;
  state: S;
}

export interface StudyAttempt {
  id: Id;
  sessionId: Id;
  flashcardId: Id;
  questionType: QuestionType;
  response: string | null;
  correct: boolean;
  answeredAt: Millis;
}

export type SetSort = 'title' | 'created' | 'updated' | 'studied';
