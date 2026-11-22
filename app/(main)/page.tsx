'use client';

import { ArrowRight, CalendarClock, Flame, Layers, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SetCard, SetGrid, SetGridSkeleton } from '@/components/flashcards/set-card';
import { Page } from '@/components/layout/app-shell';
import { NewSetDialog } from '@/components/layout/new-set-dialog';
import { ActivityBars } from '@/components/study/activity-bars';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useApiQuery } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { useStats } from '@/hooks/use-stats';
import { endOfDay, MODE_LABELS, plural, relativeTime } from '@/lib/format';

function greeting() {
  const h = new Date().getHours();
  return h < 5
    ? 'Burning the midnight oil'
    : h < 12
      ? 'Good morning'
      : h < 18
        ? 'Good afternoon'
        : 'Good evening';
}

export default function HomePage() {
  const [newOpen, setNewOpen] = useState(false);
  const { data: session } = useSession();
  const { data: resumable } = useApiQuery(['resumable'], (api) => api.resumableSessions(4));
  const { data: due } = useApiQuery(['due-counts'], (api) => api.dueCounts(endOfDay()));
  const { data: recent, isLoading } = useApiQuery(['sets', 'home-recent'], (api) =>
    api.listSets({ scope: 'studied', limit: 6 }),
  );
  const { data: mine } = useApiQuery(['sets', 'home-mine'], (api) =>
    api.listSets({ sort: 'updated', limit: 6 }),
  );
  const stats = useStats(14);

  const name =
    session?.user && session.backend === 'server'
      ? `, ${session.user.displayName.split(' ')[0]}`
      : '';
  const sets = recent?.length ? recent : mine;
  const libraryEmpty = mine?.length === 0 && recent?.length === 0;

  return (
    <Page
      title={`${greeting()}${name}`}
      description="Pick up where you left off, or review what's due today."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-gradient-to-br from-primary/12 via-card to-card p-5 md:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CalendarClock className="size-5" />
            </span>
            <div>
              <div className="font-semibold text-lg">
                {due?.dueNow
                  ? `${plural(due.dueNow, 'card')} due for review`
                  : "You're all caught up"}
              </div>
              <div className="text-muted-foreground text-sm">
                {due?.dueNow
                  ? "Spaced repetition shows cards right before you'd forget them."
                  : due?.dueToday
                    ? `${plural(due.dueToday, 'more card')} later today.`
                    : 'Nothing due right now. Learn something new!'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {due?.dueNow ? (
              <Button asChild size="lg">
                <Link href="/study/review/">
                  Review now <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button size="lg" variant="secondary" asChild>
                <Link href="/library/">
                  Pick a set to study <ArrowRight />
                </Link>
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={() => setNewOpen(true)}>
              <Plus /> New set
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 card-raised p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Flame className={stats.streak > 0 ? 'text-star' : 'text-muted-foreground'} />
              {plural(stats.streak, 'day')} streak
            </div>
            <Link href="/stats/" className="text-muted-foreground text-xs hover:text-foreground">
              Stats →
            </Link>
          </div>
          <p className="text-muted-foreground text-sm">
            {stats.studiedToday
              ? "You've studied today. Nice."
              : stats.streak > 0
                ? 'Study today to keep it going.'
                : 'Study today to start a streak.'}
          </p>
          <ActivityBars series={stats.series} className="mt-auto h-14" />
        </div>
      </div>

      {!!resumable?.length && (
        <section className="mt-10">
          <h2 className="mb-3 font-semibold text-lg">Continue studying</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {resumable.map((s) => (
              <Link
                key={s.id}
                href={`/study/${s.mode}/?set=${s.setId}`}
                className="card-link group flex items-center gap-3 p-4"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Sparkles className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.setTitle}</div>
                  <div className="text-muted-foreground text-xs">
                    {MODE_LABELS[s.mode]} · {relativeTime(s.updatedAt)}
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-lg">
            {recent?.length ? 'Recently studied' : 'Your sets'}
          </h2>
          <Link href="/library/" className="text-muted-foreground text-sm hover:text-foreground">
            View library →
          </Link>
        </div>
        {isLoading ? (
          <SetGridSkeleton count={3} />
        ) : libraryEmpty ? (
          <Empty className="rounded-2xl border border-dashed bg-dots py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Layers />
              </EmptyMedia>
              <EmptyTitle>Make your first study set</EmptyTitle>
              <EmptyDescription>
                Type cards in, or paste a list from notes, a spreadsheet or another flashcard app.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> Create a set
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <SetGrid>
            {sets?.map((s) => (
              <SetCard key={s.id} set={s} showOwner={s.ownerId !== session?.user?.id} />
            ))}
          </SetGrid>
        )}
      </section>
      <NewSetDialog open={newOpen} onOpenChange={setNewOpen} />
    </Page>
  );
}
