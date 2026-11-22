import {
  type Card,
  createEmptyCard,
  type FSRSParameters,
  fsrs,
  type Grade,
  generatorParameters,
  Rating,
} from 'ts-fsrs';
import { FsrsState, type Millis, ReviewRating } from '@/domain/models';

/** Serializable FSRS card state (dates as epoch ms). */
export interface SchedulingCard {
  due: Millis;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: FsrsState;
  lastReview: Millis | null;
}

export interface ReviewOutcome {
  card: SchedulingCard;
  /** Interval until next review in days (fractional for learning steps). */
  intervalDays: number;
  stateBefore: FsrsState;
}

export interface SchedulerOptions {
  /** Target probability of recall at review time (0.7–0.97). */
  requestRetention?: number;
  maximumIntervalDays?: number;
  /** Randomize intervals slightly to avoid review clumping. Off in tests. */
  enableFuzz?: boolean;
}

export function createScheduler(opts: SchedulerOptions = {}) {
  const params: FSRSParameters = generatorParameters({
    request_retention: opts.requestRetention ?? 0.9,
    maximum_interval: opts.maximumIntervalDays ?? 36500,
    enable_fuzz: opts.enableFuzz ?? false,
    enable_short_term: true,
  });
  const engine = fsrs(params);

  function toLib(c: SchedulingCard): Card {
    return {
      due: new Date(c.due),
      stability: c.stability,
      difficulty: c.difficulty,
      scheduled_days: c.scheduledDays,
      learning_steps: c.learningSteps,
      reps: c.reps,
      lapses: c.lapses,
      state: c.state as number,
      last_review: c.lastReview === null ? undefined : new Date(c.lastReview),
    } as Card;
  }

  function fromLib(c: Card): SchedulingCard {
    return {
      due: c.due.getTime(),
      stability: c.stability,
      difficulty: c.difficulty,
      scheduledDays: c.scheduled_days,
      learningSteps: c.learning_steps,
      reps: c.reps,
      lapses: c.lapses,
      state: c.state as number as FsrsState,
      lastReview: c.last_review ? c.last_review.getTime() : null,
    };
  }

  return {
    newCard(now: Millis): SchedulingCard {
      return fromLib(createEmptyCard(new Date(now)));
    },

    review(card: SchedulingCard, rating: ReviewRating, now: Millis): ReviewOutcome {
      const result = engine.next(toLib(card), new Date(now), rating as number as Grade);
      const next = fromLib(result.card);
      return { card: next, intervalDays: (next.due - now) / 86_400_000, stateBefore: card.state };
    },

    /** Next due time for each rating, for showing "10m / 1d / 3d / 8d" hints. */
    preview(card: SchedulingCard, now: Millis): Record<ReviewRating, Millis> {
      const all = engine.repeat(toLib(card), new Date(now));
      return {
        [ReviewRating.Again]: all[Rating.Again].card.due.getTime(),
        [ReviewRating.Hard]: all[Rating.Hard].card.due.getTime(),
        [ReviewRating.Good]: all[Rating.Good].card.due.getTime(),
        [ReviewRating.Easy]: all[Rating.Easy].card.due.getTime(),
      };
    },

    /** Probability (0..1) the learner still recalls the card at `now`. */
    retrievability(card: SchedulingCard, now: Millis): number {
      if (card.state === FsrsState.New) return 0;
      const elapsedDays = Math.max(0, (now - (card.lastReview ?? now)) / 86_400_000);
      // FSRS-6 power forgetting curve: R(t) = (1 + factor·t/S)^-decay, R(S) = 0.9.
      const decay = params.w[20] ?? 0.1542;
      const factor = 0.9 ** (-1 / decay) - 1;
      return card.stability > 0 ? (1 + (factor * elapsedDays) / card.stability) ** -decay : 0;
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;

export function isDue(card: Pick<SchedulingCard, 'due'>, now: Millis): boolean {
  return card.due <= now;
}

/** Human-friendly interval: "10m", "3h", "4d", "2mo", "1.5y". */
export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = days / 30.44;
  if (months < 12) return `${Math.round(months)}mo`;
  const years = days / 365.25;
  return `${years < 10 ? years.toFixed(1).replace(/\.0$/, '') : Math.round(years)}y`;
}

export function parseSchedulingCard(json: string | null): SchedulingCard | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as SchedulingCard;
    return typeof v.due === 'number' && typeof v.state === 'number' ? v : null;
  } catch {
    return null;
  }
}
