'use client';

import { ArrowLeft, ArrowRight, Check, Repeat, RotateCcw, Shuffle, Star, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FlipCard } from '@/components/flashcards/flip-card';
import { StudyHeader, StudyMessage } from '@/components/study/study-header';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { newSeed } from '@/domain/random';
import {
  currentFlashcard,
  type FlashcardFilter,
  type FlashcardsState,
  flashcardTally,
  goTo,
  isDeckFinished,
  mark,
  startFlashcards,
  toggleShuffle,
} from '@/domain/study/flashcards';
import { useAction } from '@/hooks/use-api';
import { useHotkeys, useStudySession, useStudySet } from '@/hooks/use-study';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';

function FlashcardsView() {
  const setId = useSearchParams().get('set') ?? '';
  const { data, cards, full, isLoading } = useStudySet(setId);
  const session = useStudySession<FlashcardsState>(setId, 'flashcards', 1);
  const action = useAction();
  const [flipped, setFlipped] = useState(false);
  const [track, setTrack] = useState(true);
  const [direction, setDirection] = useState(1);
  const touchX = useRef<number | null>(null);
  const progress = data?.progress ?? {};

  const idsFor = (filter: FlashcardFilter) =>
    cards
      .filter((c) => {
        const p = progress[c.id];
        if (filter === 'starred') return !!p?.starred;
        if (filter === 'unknown') return p?.known !== true;
        return true;
      })
      .map((c) => c.id);

  const started = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once when data and the saved session have loaded
  useEffect(() => {
    if (!session.ready || isLoading || started.current || cards.length === 0) return;
    started.current = true;
    if (session.state) {
      const order = session.state.order.filter((id) => full.has(id));
      if (order.length !== session.state.order.length)
        void session.commit({
          ...session.state,
          order,
          index: Math.min(session.state.index, order.length),
        });
      if (session.resumed && session.state.index > 0)
        toast('Picked up where you left off', {
          action: { label: 'Start over', onClick: () => restart('all') },
        });
      return;
    }
    void session.start(
      startFlashcards(idsFor('all'), {
        shuffled: false,
        reversed: false,
        filter: 'all',
        seed: newSeed(),
      }),
    );
  }, [session.ready, isLoading, cards.length]);

  const state = session.state;
  const cardId = state ? currentFlashcard(state) : null;
  const card = cardId ? full.get(cardId) : undefined;
  const finished = state ? isDeckFinished(state) : false;
  const tally = state ? flashcardTally(state) : { known: 0, unknown: 0, total: 0 };
  const starred = cardId ? !!progress[cardId]?.starred : false;

  const restart = (
    filter: FlashcardFilter,
    opts: Partial<Pick<FlashcardsState, 'shuffled' | 'reversed'>> = {},
  ) => {
    const ids = idsFor(filter);
    if (ids.length === 0) {
      toast(
        filter === 'starred' ? 'No starred cards in this set yet' : 'You know every card. Nice!',
      );
      return;
    }
    setFlipped(false);
    void session.start(
      startFlashcards(ids, {
        shuffled: opts.shuffled ?? state?.shuffled ?? false,
        reversed: opts.reversed ?? state?.reversed ?? false,
        filter,
        seed: newSeed(),
      }),
    );
  };

  const move = (delta: number) => {
    if (!state) return;
    setDirection(delta);
    setFlipped(false);
    void session.commit(goTo(state, state.index + delta));
  };

  const answer = (known: boolean) => {
    if (!state || !cardId) return;
    setDirection(1);
    setFlipped(false);
    void session.commit(mark(state, known), {
      attempts: [
        {
          flashcardId: cardId,
          questionType: 'flashcard',
          response: known ? 'known' : 'unknown',
          correct: known,
        },
      ],
      completed: state.index + 1 >= state.order.length,
    });
    void action((api) => api.setKnown([cardId], known), { refresh: false });
  };

  const toggleStar = () => {
    if (!cardId) return;
    void action((api) => api.setStarred(cardId, !starred));
  };

  useHotkeys((e) => {
    if (!state || finished) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFlipped((f) => !f);
    } else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else if (track && e.key === '1') answer(false);
    else if (track && e.key === '2') answer(true);
    else if (e.key.toLowerCase() === 's') toggleStar();
  });

  const front = useMemo(
    () =>
      card ? { text: card.front, media: card.media, side: 'front' as const, label: 'Term' } : null,
    [card],
  );
  const back = useMemo(
    () =>
      card
        ? { text: card.back, media: card.media, side: 'back' as const, label: 'Definition' }
        : null,
    [card],
  );

  if (!setId) return <StudyMessage title="No set selected" />;
  if (isLoading || !session.ready) return <StudyMessage title="Loading…" />;
  if (cards.length === 0) {
    return (
      <StudyMessage title="This set has no cards yet">
        <Button asChild>
          <Link href={`/set/edit/?id=${setId}`}>Add cards</Link>
        </Button>
      </StudyMessage>
    );
  }
  if (!state) return <StudyMessage title="Loading…" />;

  const total = state.order.length;
  const shown = state.reversed ? back : front;
  const hidden = state.reversed ? front : back;

  return (
    <>
      <StudyHeader
        setId={setId}
        title={data?.set.title ?? ''}
        mode="Flashcards"
        progress={total ? state.index / total : 1}
        progressLabel={`${Math.min(state.index + 1, total)} / ${total}`}
      />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={state.filter} onValueChange={(v) => restart(v as FlashcardFilter)}>
            <SelectTrigger className="w-40" aria-label="Which cards">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cards</SelectItem>
              <SelectItem value="starred">Starred only</SelectItem>
              <SelectItem value="unknown">Still learning</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={state.shuffled ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={state.shuffled}
            onClick={() =>
              void session.commit(toggleShuffle(state, idsFor(state.filter), newSeed()))
            }
          >
            <Shuffle /> Shuffle
          </Button>
          <Button
            variant={state.reversed ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={state.reversed}
            onClick={() => {
              setFlipped(false);
              void session.commit({ ...state, reversed: !state.reversed });
            }}
          >
            <Repeat /> Definition first
          </Button>
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-muted-foreground text-sm">
            Track progress <Switch checked={track} onCheckedChange={setTrack} />
          </label>
        </div>

        {finished ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-6 card-raised rounded-3xl p-10 text-center"
          >
            <div className="text-4xl">🎉</div>
            <h2 className="font-semibold text-2xl">You went through all {plural(total, 'card')}</h2>
            {track && (
              <div className="flex gap-8 text-sm">
                <div>
                  <div className="font-semibold text-3xl text-success">{tally.known}</div>
                  Know
                </div>
                <div>
                  <div className="font-semibold text-3xl text-warning">{tally.unknown}</div>
                  Still learning
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {track && tally.unknown > 0 && (
                <Button
                  onClick={() => {
                    const ids = Object.entries(state.marks)
                      .filter(([, v]) => v === 'unknown')
                      .map(([id]) => id);
                    setFlipped(false);
                    void session.start(
                      startFlashcards(ids, {
                        shuffled: state.shuffled,
                        reversed: state.reversed,
                        filter: 'unknown',
                        seed: newSeed(),
                      }),
                    );
                  }}
                >
                  Study {plural(tally.unknown, 'card')} still learning
                </Button>
              )}
              <Button variant="outline" onClick={() => restart(state.filter)}>
                <RotateCcw /> Restart
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/study/learn/?set=${setId}`}>Try Learn mode</Link>
              </Button>
            </div>
          </motion.div>
        ) : (
          shown &&
          hidden && (
            <div
              className="relative"
              onTouchStart={(e) => {
                touchX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (touchX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                touchX.current = null;
                if (Math.abs(dx) > 60) {
                  if (track) answer(dx > 0);
                  else move(dx > 0 ? -1 : 1);
                }
              }}
            >
              <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                <motion.div
                  key={`${cardId}-${state.index}`}
                  custom={direction}
                  initial={{ opacity: 0, x: direction * 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -60 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <FlipCard
                    className="h-[min(60vh,28rem)]"
                    flipped={flipped}
                    onFlip={() => setFlipped((f) => !f)}
                    front={shown}
                    back={hidden}
                  />
                </motion.div>
              </AnimatePresence>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-3 z-10"
                    onClick={toggleStar}
                    aria-pressed={starred}
                    aria-label={starred ? 'Unstar card' : 'Star card'}
                  >
                    <Star
                      className={cn(starred ? 'fill-star text-star' : 'text-muted-foreground')}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Star (S)</TooltipContent>
              </Tooltip>
            </div>
          )
        )}

        {!finished && (
          <div className="flex items-center justify-center gap-3">
            {track ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 min-w-40 border-warning/60 hover:bg-warning/10"
                  onClick={() => answer(false)}
                >
                  <X /> Still learning <Kbd className="ml-1">1</Kbd>
                </Button>
                <Button
                  variant="outline"
                  size="icon-lg"
                  disabled={state.index === 0}
                  onClick={() => move(-1)}
                  aria-label="Previous card"
                >
                  <ArrowLeft />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 min-w-40 border-success/60 hover:bg-success/10"
                  onClick={() => answer(true)}
                >
                  <Check /> Know it <Kbd className="ml-1">2</Kbd>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="icon-lg"
                  disabled={state.index === 0}
                  onClick={() => move(-1)}
                  aria-label="Previous card"
                >
                  <ArrowLeft />
                </Button>
                <span className="min-w-20 text-center text-muted-foreground text-sm tabular-nums">
                  {state.index + 1} / {total}
                </span>
                <Button
                  variant="outline"
                  size="icon-lg"
                  onClick={() => move(1)}
                  aria-label="Next card"
                >
                  <ArrowRight />
                </Button>
              </>
            )}
          </div>
        )}
        <p className="hidden text-center text-muted-foreground text-xs sm:block">
          <Kbd>Space</Kbd> flip · <Kbd>←</Kbd> <Kbd>→</Kbd> previous / next · <Kbd>S</Kbd> star
          {track && (
            <>
              {' '}
              · <Kbd>1</Kbd> still learning · <Kbd>2</Kbd> know it · swipe on touch screens
            </>
          )}
        </p>
      </div>
    </>
  );
}

export default function FlashcardsPage() {
  return (
    <Suspense fallback={null}>
      <FlashcardsView />
    </Suspense>
  );
}
