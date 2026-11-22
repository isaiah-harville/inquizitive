'use client';

import { CalendarClock, Flame, Layers, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Page } from '@/components/layout/app-shell';
import { ActivityBars } from '@/components/study/activity-bars';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useStats } from '@/hooks/use-stats';
import { plural } from '@/lib/format';

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 card-raised p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className="size-4" /> {label}
      </div>
      <div className="font-semibold text-3xl tabular-nums">{value}</div>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </div>
  );
}

export default function StatsPage() {
  const stats = useStats(60);
  const d = stats.data;

  return (
    <Page
      title="Statistics"
      description="Everything here is computed on your device from your own study history."
    >
      {!d ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              icon={Flame}
              label="Current streak"
              value={plural(stats.streak, 'day')}
              hint={`Longest: ${plural(stats.longest, 'day')}`}
            />
            <Tile
              icon={Target}
              label="Studied today"
              value={d.totals.answersToday + d.totals.reviewsToday}
              hint={`${d.totals.reviewsToday} reviews · ${d.totals.answersToday} answers`}
            />
            <Tile
              icon={CalendarClock}
              label="Due now"
              value={d.due.dueNow}
              hint={`${d.due.dueToday} by end of day`}
            />
            <Tile
              icon={Layers}
              label="Cards studied"
              value={d.totals.cardsStudied.toLocaleString()}
              hint="All time, unique cards"
            />
          </div>

          <section className="mt-8 card-raised p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Daily activity</h2>
              <span className="text-muted-foreground text-xs">last 60 days</span>
            </div>
            <ActivityBars series={stats.series} className="h-32" />
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <section className="card-raised p-5">
              <h2 className="mb-4 font-semibold">Accuracy by set</h2>
              {d.accuracy.length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-base">No answers yet</EmptyTitle>
                    <EmptyDescription>
                      Try Learn or a practice test to see your accuracy.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="flex flex-col gap-3">
                  {d.accuracy.map((a) => {
                    const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
                    return (
                      <li key={a.setId}>
                        <div className="mb-1 flex justify-between gap-3 text-sm">
                          <Link href={`/set/?id=${a.setId}`} className="truncate hover:underline">
                            {a.title}
                          </Link>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {pct}% · {a.correct}/{a.total}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="card-raised p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                <TrendingUp className="size-4 text-primary" /> Long-term memory
              </h2>
              <p className="mb-4 text-muted-foreground text-xs">
                Cards in spaced repetition, by stage.
              </p>
              <dl className="grid gap-2 text-sm">
                {(
                  [
                    ['Learning', d.states.learning],
                    ['Relearning', d.states.relearning],
                    ['In long-term review', d.states.review],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{n}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2">
                  <dt className="text-muted-foreground">Total reviews</dt>
                  <dd className="font-medium tabular-nums">
                    {d.totals.totalReviews.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </Page>
  );
}
