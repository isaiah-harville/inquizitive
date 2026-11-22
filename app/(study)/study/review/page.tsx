'use client';

import { CalendarCheck } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CardFace } from '@/components/flashcards/flip-card';
import { StudyHeader, StudyMessage } from '@/components/study/study-header';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ReviewRating } from '@/domain/models';
import { formatInterval } from '@/domain/scheduling/fsrs';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { useHotkeys } from '@/hooks/use-study';
import { cn } from '@/lib/utils';
import type { ReviewItem } from '@/services/repositories/progress';

const RATINGS = [
  {
    rating: ReviewRating.Again,
    label: 'Again',
    key: '1',
    className: 'border-destructive/50 hover:bg-destructive/10',
  },
  {
    rating: ReviewRating.Hard,
    label: 'Hard',
    key: '2',
    className: 'border-warning/60 hover:bg-warning/10',
  },
  {
    rating: ReviewRating.Good,
    label: 'Good',
    key: '3',
    className: 'border-success/50 hover:bg-success/10',
  },
  {
    rating: ReviewRating.Easy,
    label: 'Easy',
    key: '4',
    className: 'border-primary/50 hover:bg-primary/10',
  },
] as const;

const NEW_PER_SESSION = 20;
/** Cards rated Again come back later in the same session. */
const REQUEUE_GAP = 4;
/** Cards scheduled sooner than this (~20 minutes) come back before the session ends. */
const SAME_SESSION_DAYS = 20 / 1440;

function ReviewView() {
  const setId = useSearchParams().get('set');
  const action = useAction();
  const { data: set } = useApiQuery(['set', setId], (api) => api.getSet(setId as string), {
    enabled: !!setId,
  });
  const { data: initial, isLoading } = useApiQuery(
    ['review-queue', setId],
    (api) => api.reviewQueue(setId ? { setId, newLimit: NEW_PER_SESSION } : { limit: 500 }),
    { staleTime: Number.POSITIVE_INFINITY, gcTime: 0 },
  );
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (initial && queue === null) setQueue(initial);
  }, [initial, queue]);

  const item = queue?.[0];
  const media = item && set ? set.cards.find((c) => c.id === item.card.id)?.media : undefined;
  const { data: preview } = useApiQuery(
    ['review-preview', item?.card.id, done],
    (api) => api.previewReview(item?.scheduling ?? null),
    {
      enabled: !!item && revealed,
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the timer per card
  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
  }, [item?.card.id, done]);

  const rate = async (rating: ReviewRating) => {
    if (!item || busy) return;
    setBusy(true);
    try {
      const result = await action(
        (api) => api.recordReview(item.card.id, rating, Date.now() - shownAt.current),
        {
          refresh: false,
        },
      );
      setDone((d) => d + 1);
      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        if (result.intervalDays < SAME_SESSION_DAYS) {
          const again: ReviewItem = { ...item, scheduling: result.card };
          return [...rest.slice(0, REQUEUE_GAP), again, ...rest.slice(REQUEUE_GAP)];
        }
        return rest;
      });
    } finally {
      setBusy(false);
    }
  };

  useHotkeys((e) => {
    if (!item) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      setRevealed(true);
      return;
    }
    if (revealed) {
      const r = RATINGS.find((x) => x.key === e.key);
      if (r) void rate(r.rating);
    }
  });

  const title = setId ? (set?.set.title ?? '') : 'All due cards';
  const total = useMemo(() => done + (queue?.length ?? 0), [done, queue]);

  if (isLoading || queue === null) return <StudyMessage title="Loading…" />;

  if (!item) {
    return (
      <>
        <StudyHeader setId={setId} title={title} mode="Review" progress={1} />
        <StudyMessage title={done ? 'Review complete' : 'Nothing due right now'}>
          <CalendarCheck className="size-12 text-primary" />
          <p className="text-muted-foreground">
            {done
              ? `You reviewed ${done} card${done === 1 ? '' : 's'}. Each one is scheduled for just before you'd forget it.`
              : "Cards come back here when they're due. Study a set to add more."}
          </p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href={setId ? `/set/?id=${setId}` : '/'}>Done</Link>
            </Button>
          </div>
        </StudyMessage>
      </>
    );
  }

  return (
    <>
      <StudyHeader
        setId={setId}
        title={title}
        mode="Review"
        progress={total ? done / total : 0}
        progressLabel={`${queue.length} left`}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-8">
        {!setId && (
          <div className="text-center text-muted-foreground text-sm">from {item.setTitle}</div>
        )}
        <motion.div
          key={`${item.card.id}-${done}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden card-raised rounded-3xl shadow-sm"
        >
          <div className="relative min-h-56">
            <CardFace
              content={{
                text: item.card.front,
                media,
                side: 'front',
                label: item.scheduling ? undefined : 'New',
              }}
            />
          </div>
          {revealed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative min-h-40 border-t border-dashed"
            >
              <CardFace content={{ text: item.card.back, media, side: 'back' }} />
              {item.card.explanation && (
                <p className="px-8 pb-6 text-center text-muted-foreground text-sm">
                  {item.card.explanation}
                </p>
              )}
            </motion.div>
          )}
        </motion.div>
        {!revealed ? (
          <Button size="lg" className="h-14" onClick={() => setRevealed(true)} autoFocus>
            Show answer{' '}
            <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">Space</Kbd>
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RATINGS.map((r) => (
              <Button
                key={r.rating}
                variant="outline"
                disabled={busy}
                onClick={() => rate(r.rating)}
                className={cn('flex h-16 flex-col gap-0.5', r.className)}
              >
                <span className="font-semibold">{r.label}</span>
                <span className="text-muted-foreground text-xs">
                  {preview ? formatInterval(preview[r.rating] - Date.now()) : '…'} ·{' '}
                  <Kbd>{r.key}</Kbd>
                </span>
              </Button>
            ))}
          </div>
        )}
        <p className="text-center text-muted-foreground text-xs">
          Be honest: “Again” if you forgot, “Hard” if it took effort, “Good” if you recalled it,
          “Easy” if it was instant.
        </p>
      </div>
    </>
  );
}

export default function ReviewStudyPage() {
  return (
    <Suspense fallback={null}>
      <ReviewView />
    </Suspense>
  );
}
