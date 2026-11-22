'use client';

import { Archive, CalendarClock, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { StudySetSummary } from '@/domain/models';
import { plural, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function SetProgressBar({
  learned,
  total,
  className,
}: {
  learned: number;
  total: number;
  className?: string;
}) {
  const pct = total === 0 ? 0 : Math.round((learned / total) * 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Cards learned"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right text-muted-foreground text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

export function SetCard({ set, showOwner }: { set: StudySetSummary; showOwner?: boolean }) {
  return (
    <Link
      href={`/set/?id=${set.id}`}
      className="card-link group flex flex-col gap-3 p-5 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 font-bold text-[1.05rem] leading-snug">{set.title}</h3>
        {set.archivedAt && (
          <Archive className="size-4 shrink-0 text-muted-foreground" aria-label="Archived" />
        )}
      </div>
      {set.description && (
        <p className="line-clamp-2 text-muted-foreground text-sm">{set.description}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="rounded-full font-semibold">
          {plural(set.cardCount, 'term')}
        </Badge>
        {set.dueCount > 0 && (
          <Badge className="gap-1 bg-warning/20 text-foreground">
            <CalendarClock className="size-3" /> {set.dueCount} due
          </Badge>
        )}
        {set.visibility === 'shared' && !showOwner && (
          <Badge variant="outline" className="gap-1">
            <Users className="size-3" /> Shared
          </Badge>
        )}
        {set.tags.slice(0, 3).map((t) => (
          <Badge key={t} variant="outline" className="text-muted-foreground">
            #{t}
          </Badge>
        ))}
      </div>
      <SetProgressBar learned={set.learnedCount} total={set.cardCount} />
      <div className="flex justify-between text-muted-foreground text-xs">
        <span>
          {showOwner
            ? `by ${set.ownerName}`
            : set.lastStudiedAt
              ? `Studied ${relativeTime(set.lastStudiedAt)}`
              : 'Not studied yet'}
        </span>
      </div>
    </Link>
  );
}

export function SetGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function SetGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <SetGrid>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i} className="flex flex-col gap-3 card-raised p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </SetGrid>
  );
}
