'use client';

import { Timer, Trophy } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { RichText } from '@/components/flashcards/rich-text';
import { StudyHeader, StudyMessage } from '@/components/study/study-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { newSeed } from '@/domain/random';
import {
  buildMatchBoard,
  formatDuration,
  isMatch,
  type MatchTile,
  MIN_PAIRS,
  maxPairsFor,
} from '@/domain/study/match';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { useStudySet } from '@/hooks/use-study';
import { cn } from '@/lib/utils';

const PENALTY_MS = 1000;

function MatchView() {
  const setId = useSearchParams().get('set') ?? '';
  const { data, cards, isLoading } = useStudySet(setId);
  const action = useAction();
  const maxPairs = useMemo(() => maxPairsFor(cards), [cards]);
  const [pairs, setPairs] = useState(6);
  const [tiles, setTiles] = useState<MatchTile[] | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState<{
    time: number;
    best: number | null;
    isBest: boolean;
  } | null>(null);
  const dragging = useRef<string | null>(null);
  const pairCount = Math.min(pairs, maxPairs);
  const { data: best } = useApiQuery(
    ['match-best', setId, pairCount],
    (api) => api.bestMatchTime(setId, pairCount),
    {
      enabled: !!setId && pairCount >= MIN_PAIRS,
    },
  );

  useEffect(() => {
    if (!tiles || finished) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [tiles, finished]);

  const play = () => {
    setTiles(buildMatchBoard(cards, pairCount, newSeed()));
    setMatched(new Set());
    setSelected(null);
    setWrong([]);
    setPenalty(0);
    setFinished(null);
    setStartedAt(Date.now());
    setNow(Date.now());
  };

  const attempt = async (aId: string, bId: string) => {
    if (!tiles || aId === bId) return;
    const a = tiles.find((t) => t.id === aId);
    const b = tiles.find((t) => t.id === bId);
    if (!a || !b) return;
    setSelected(null);
    if (isMatch(a, b)) {
      const next = new Set(matched).add(a.id).add(b.id);
      setMatched(next);
      if (next.size === tiles.length) {
        const time = Date.now() - startedAt + penalty;
        const result = await action((api) => api.recordMatchTime(setId, tiles.length / 2, time), {
          refresh: false,
        });
        setFinished({ time, best: result.previousBest, isBest: result.isBest });
      }
    } else {
      setWrong([a.id, b.id]);
      setPenalty((p) => p + PENALTY_MS);
      setTimeout(() => setWrong([]), 450);
    }
  };

  const click = (id: string) => {
    if (matched.has(id)) return;
    if (!selected) setSelected(id);
    else if (selected === id) setSelected(null);
    else void attempt(selected, id);
  };

  if (!setId) return <StudyMessage title="No set selected" />;
  if (isLoading) return <StudyMessage title="Loading…" />;
  const title = data?.set.title ?? '';

  if (maxPairs < MIN_PAIRS) {
    return (
      <>
        <StudyHeader setId={setId} title={title} mode="Match" />
        <StudyMessage title="Not enough cards to match">
          <p className="text-muted-foreground">
            Match needs at least two cards with different terms and definitions.
          </p>
          <Button asChild>
            <Link href={`/set/edit/?id=${setId}`}>Add cards</Link>
          </Button>
        </StudyMessage>
      </>
    );
  }

  const elapsed = tiles ? (finished ? finished.time : now - startedAt + penalty) : 0;

  if (!tiles) {
    return (
      <>
        <StudyHeader setId={setId} title={title} mode="Match" />
        <div className="mx-auto grid w-full max-w-md gap-6 px-4 py-14 text-center">
          <h1 className="font-semibold text-2xl">Ready to race the clock?</h1>
          <p className="text-muted-foreground">
            Match every term with its definition as fast as you can. Wrong matches add a second.
          </p>
          <div className="grid gap-3 text-left">
            <div className="flex items-center justify-between">
              <Label>Pairs</Label>
              <span className="font-medium tabular-nums">{pairCount}</span>
            </div>
            <Slider
              min={MIN_PAIRS}
              max={maxPairs}
              step={1}
              value={[pairCount]}
              onValueChange={([v]) => setPairs(v)}
              aria-label="Number of pairs"
            />
          </div>
          {best != null && (
            <p className="flex items-center justify-center gap-1.5 text-muted-foreground text-sm">
              <Trophy className="size-4 text-star" /> Your best with {pairCount} pairs:{' '}
              {formatDuration(best)}
            </p>
          )}
          <Button size="lg" onClick={play} autoFocus>
            Start game
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <StudyHeader
        setId={setId}
        title={title}
        mode="Match"
        progress={matched.size / tiles.length}
        actions={
          <span className="flex items-center gap-1.5 font-semibold tabular-nums" aria-live="off">
            <Timer className="size-4 text-primary" /> {formatDuration(elapsed)}
          </span>
        }
      />
      {finished ? (
        <StudyMessage title={finished.isBest ? 'New personal best!' : 'Board cleared!'}>
          <div className="font-semibold text-5xl tabular-nums">{formatDuration(finished.time)}</div>
          {finished.best !== null && !finished.isBest && (
            <p className="text-muted-foreground">
              Your best is {formatDuration(finished.best)}. So close!
            </p>
          )}
          {finished.isBest && finished.best !== null && (
            <p className="text-muted-foreground">
              Beat your old record of {formatDuration(finished.best)}.
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={play} autoFocus>
              Play again
            </Button>
            <Button variant="outline" onClick={() => setTiles(null)}>
              Change pairs
            </Button>
          </div>
        </StudyMessage>
      ) : (
        <div className="mx-auto grid w-full max-w-5xl flex-1 auto-rows-fr grid-cols-2 gap-3 px-4 py-6 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence>
            {tiles.map((t) =>
              matched.has(t.id) ? (
                <div key={t.id} aria-hidden="true" />
              ) : (
                <motion.button
                  key={t.id}
                  type="button"
                  layout
                  exit={{ opacity: 0, scale: 0.85 }}
                  animate={wrong.includes(t.id) ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                  transition={{ duration: 0.35 }}
                  draggable
                  onDragStart={() => {
                    dragging.current = t.id;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging.current) void attempt(dragging.current, t.id);
                    dragging.current = null;
                  }}
                  onClick={() => click(t.id)}
                  aria-pressed={selected === t.id}
                  className={cn(
                    'flex min-h-24 items-center justify-center rounded-2xl border-2 bg-card p-3 text-center text-sm shadow-xs transition-colors sm:text-base',
                    'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected === t.id && 'border-primary bg-primary/10',
                    wrong.includes(t.id) && 'border-destructive bg-destructive/10',
                  )}
                >
                  <RichText text={t.text} className="line-clamp-5" />
                </motion.button>
              ),
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={null}>
      <MatchView />
    </Suspense>
  );
}
