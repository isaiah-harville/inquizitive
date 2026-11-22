'use client';

import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  Copy,
  FileCheck2,
  Globe,
  Layers,
  Lock,
  Pencil,
  Puzzle,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { FlipCard } from '@/components/flashcards/flip-card';
import { SetProgressBar } from '@/components/flashcards/set-card';
import { Page } from '@/components/layout/app-shell';
import { useConfirm } from '@/components/layout/confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { Flashcard } from '@/domain/models';
import { SetActionsMenu } from '@/features/sets/set-actions-menu';
import { TermsList } from '@/features/sets/terms-list';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { isMultiUser, useSession } from '@/hooks/use-session';
import { plural } from '@/lib/format';

const MODES = [
  { mode: 'flashcards', label: 'Flashcards', hint: 'Flip through and sort', icon: Layers },
  { mode: 'learn', label: 'Learn', hint: 'Adaptive questions to mastery', icon: BookOpenCheck },
  { mode: 'test', label: 'Test', hint: 'A graded practice test', icon: FileCheck2 },
  { mode: 'match', label: 'Match', hint: 'Race to pair them up', icon: Puzzle },
] as const;

function Preview({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[Math.min(index, cards.length - 1)];
  const go = (d: number) => {
    setFlipped(false);
    setIndex((i) => (i + d + cards.length) % cards.length);
  };
  if (!card) return null;
  return (
    <div className="flex flex-col gap-3">
      <FlipCard
        className="h-72 sm:h-80"
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        front={{ text: card.front, media: card.media, side: 'front' }}
        back={{ text: card.back, media: card.media, side: 'back' }}
      />
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="Previous card">
          <ArrowLeft />
        </Button>
        <span className="min-w-16 text-center text-muted-foreground text-sm tabular-nums">
          {index + 1} / {cards.length}
        </span>
        <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="Next card">
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function SetView() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const focusCard = params.get('card');
  const router = useRouter();
  const action = useAction();
  const _confirm = useConfirm();
  const { data: session } = useSession();
  const { data, isLoading, error } = useApiQuery(['set', id], (api) => api.getSet(id), {
    enabled: !!id,
  });

  useEffect(() => {
    if (id) void action((api) => api.touchOpened(id), { refresh: false }).catch(() => {});
  }, [id, action]);

  useEffect(() => {
    if (focusCard && data) {
      document
        .getElementById(`card-${focusCard}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [focusCard, data]);

  const stats = useMemo(() => {
    if (!data) return { known: 0, learning: 0, fresh: 0, starred: 0 };
    let known = 0;
    let learning = 0;
    let starred = 0;
    for (const c of data.cards) {
      const p = data.progress[c.id];
      if (p?.starred) starred++;
      if (p?.known === true || p?.fsrsState === 2) known++;
      else if (p && (p.known === false || p.reviewCount > 0)) learning++;
    }
    return { known, learning, fresh: data.cards.length - known - learning, starred };
  }, [data]);

  if (!id || error) {
    return (
      <Page>
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>Study set not found</EmptyTitle>
            <EmptyDescription>
              {error?.message ?? "It may have been deleted, or it isn't shared with you."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/library/">Back to library</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }
  if (isLoading || !data) {
    return (
      <Page>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="mt-3 h-5 w-1/3" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-8 h-80 rounded-3xl" />
      </Page>
    );
  }

  const { set, cards, progress, canEdit } = data;
  const mine = set.ownerId === session?.user?.id;
  const multi = isMultiUser(session);
  const empty = cards.length === 0;

  return (
    <Page>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            {!mine && <span>by {set.ownerName}</span>}
            {multi && mine && (
              <Badge variant="outline" className="gap-1">
                {set.visibility === 'shared' ? (
                  <Globe className="size-3" />
                ) : (
                  <Lock className="size-3" />
                )}
                {set.visibility === 'shared' ? 'Shared with everyone' : 'Private'}
              </Badge>
            )}
            {set.archivedAt && (
              <Badge variant="outline" className="gap-1">
                <Archive className="size-3" /> Archived
              </Badge>
            )}
          </div>
          <h1 className="font-bold text-2xl sm:text-[2rem]">{set.title}</h1>
          {set.description && (
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-muted-foreground">
              {set.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{plural(set.cardCount, 'card')}</Badge>
            {set.tags.map((t) => (
              <Link key={t} href={`/library/?tag=${encodeURIComponent(t)}`}>
                <Badge variant="outline" className="text-muted-foreground hover:text-foreground">
                  #{t}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/set/edit/?id=${set.id}`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                const copy = await action((api) => api.duplicateSet(set.id), {
                  success: 'Copied to your library',
                });
                router.push(`/set/?id=${copy}`);
              }}
            >
              <Copy /> Copy to my library
            </Button>
          )}
          <SetActionsMenu detail={data} mine={mine} multi={multi} />
        </div>
      </div>

      {empty ? (
        <Empty className="mt-10 rounded-2xl border border-dashed bg-dots py-16">
          <EmptyHeader>
            <EmptyTitle>This set has no cards yet</EmptyTitle>
            <EmptyDescription>
              Add cards one at a time, or paste a whole list at once.
            </EmptyDescription>
          </EmptyHeader>
          {canEdit && (
            <EmptyContent className="flex-row justify-center">
              <Button asChild>
                <Link href={`/set/edit/?id=${set.id}`}>
                  <Pencil /> Add cards
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/import/?set=${set.id}`}>
                  <Upload /> Import
                </Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {MODES.map((m) => (
              <Link
                key={m.mode}
                href={`/study/${m.mode}/?set=${set.id}`}
                className="card-link group flex items-center gap-3 p-4 hover:-translate-y-0.5 sm:flex-col sm:items-start sm:gap-2"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <m.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-bold">{m.label}</div>
                  <div className="text-muted-foreground text-xs">{m.hint}</div>
                </div>
              </Link>
            ))}
            <Link
              href={`/study/review/?set=${set.id}`}
              className="card-link group col-span-2 flex flex-col gap-2 bg-primary! p-4 text-primary-foreground hover:-translate-y-0.5 lg:col-span-1"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary-foreground/15">
                <CalendarClock className="size-5" />
              </span>
              <div className="font-bold">Spaced review</div>
              <div className="text-primary-foreground/80 text-xs">
                {set.dueCount ? `${set.dueCount} due now` : 'Long-term memory, scheduled for you'}
              </div>
            </Link>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_16rem]">
            <Preview cards={cards} />
            <div className="flex flex-col gap-4 card-raised p-5">
              <h2 className="font-semibold">Your progress</h2>
              <SetProgressBar learned={stats.known} total={cards.length} />
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Learned</dt>
                  <dd className="font-medium tabular-nums">{stats.known}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Still learning</dt>
                  <dd className="font-medium tabular-nums">{stats.learning}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Not started</dt>
                  <dd className="font-medium tabular-nums">{stats.fresh}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Starred</dt>
                  <dd className="font-medium tabular-nums">{stats.starred}</dd>
                </div>
              </dl>
            </div>
          </div>

          <TermsList
            cards={cards}
            progress={progress}
            focusCard={focusCard}
            starredCount={stats.starred}
          />
        </>
      )}
    </Page>
  );
}

export default function SetPage() {
  return (
    <Suspense fallback={null}>
      <SetView />
    </Suspense>
  );
}
