'use client';

import { ArrowRight, CalendarCheck, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Page } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useApiQuery } from '@/hooks/use-api';
import { endOfDay, plural } from '@/lib/format';

export default function ReviewPage() {
  const { data: due } = useApiQuery(['due-counts'], (api) => api.dueCounts(endOfDay()));
  const { data: queue } = useApiQuery(['review-overview'], (api) =>
    api.reviewQueue({ limit: 1000 }),
  );
  const { data: sets } = useApiQuery(['sets', 'review-all'], (api) =>
    api.listSets({ sort: 'studied' }),
  );

  const bySet = useMemo(() => {
    const m = new Map<string, { title: string; count: number }>();
    for (const i of queue ?? [])
      m.set(i.setId, { title: i.setTitle, count: (m.get(i.setId)?.count ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [queue]);

  const notStarted = (sets ?? []).filter((s) => s.cardCount > 0 && s.dueCount === 0).slice(0, 6);

  return (
    <Page
      title="Due for review"
      description="Spaced repetition (FSRS) brings each card back right before you'd forget it."
    >
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-gradient-to-br from-primary/12 via-card to-card p-6">
        <CalendarClock className="size-8 text-primary" />
        <div className="flex-1">
          <div className="font-semibold text-xl">{plural(due?.dueNow ?? 0, 'card')} due now</div>
          <div className="text-muted-foreground text-sm">
            {plural(due?.dueToday ?? 0, 'card')} due by the end of today
          </div>
        </div>
        <Button size="lg" asChild disabled={!due?.dueNow}>
          <Link
            href="/study/review/"
            aria-disabled={!due?.dueNow}
            className={!due?.dueNow ? 'pointer-events-none opacity-50' : ''}
          >
            Review all <ArrowRight />
          </Link>
        </Button>
      </div>

      {bySet.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold text-lg">By set</h2>
          <ul className="divide-y divide-border card-raised">
            {bySet.map(([id, s]) => (
              <li key={id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="text-muted-foreground text-xs">{plural(s.count, 'card')} due</div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/study/review/?set=${id}`}>Review</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty className="mt-8 rounded-2xl border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCheck />
            </EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>
              Start spaced review on a set below to build long-term memory.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {notStarted.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold text-lg">Add new cards to your reviews</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {notStarted.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/study/review/?set=${s.id}`}
                  className="card-link flex items-center gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {plural(s.cardCount, 'card')}
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
