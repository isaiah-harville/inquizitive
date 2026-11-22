'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';
import { CardImage } from '@/components/flashcards/card-image';
import { RichText } from '@/components/flashcards/rich-text';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CardProgress, Flashcard } from '@/domain/models';
import { useAction } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

export function TermsList({
  cards,
  progress,
  focusCard,
  starredCount,
}: {
  cards: Flashcard[];
  progress: Record<string, CardProgress>;
  focusCard: string | null;
  starredCount: number;
}) {
  const action = useAction();
  const [listFilter, setListFilter] = useState<'all' | 'starred'>('all');
  const stats = { starred: starredCount };
  const listed = listFilter === 'starred' ? cards.filter((c) => progress[c.id]?.starred) : cards;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">Terms in this set ({cards.length})</h2>
        <Select value={listFilter} onValueChange={(v) => setListFilter(v as 'all' | 'starred')}>
          <SelectTrigger className="w-36" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All terms</SelectItem>
            <SelectItem value="starred">Starred ({stats.starred})</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ul className="flex flex-col gap-2">
        {listed.map((c) => {
          const starred = !!progress[c.id]?.starred;
          const frontImg = c.media.find((m) => m.side === 'front');
          const backImg = c.media.find((m) => m.side === 'back');
          return (
            <li
              key={c.id}
              id={`card-${c.id}`}
              className={cn(
                'grid grid-cols-[1fr_auto] gap-3 card-raised p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-start',
                focusCard === c.id && 'ring-2 ring-primary/50',
              )}
            >
              <div className="flex min-w-0 flex-col gap-2 font-medium">
                <RichText text={c.front} />
                {frontImg && (
                  <CardImage path={frontImg.relativePath} className="h-20 w-auto self-start" />
                )}
              </div>
              <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-2 border-t pt-3 text-muted-foreground sm:col-span-1 sm:row-start-auto sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                <RichText text={c.back} className="text-foreground/90" />
                {backImg && (
                  <CardImage path={backImg.relativePath} className="h-20 w-auto self-start" />
                )}
                {c.explanation && <RichText text={c.explanation} className="text-sm" />}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="col-start-2 row-start-1 sm:col-start-3"
                aria-pressed={starred}
                aria-label={starred ? 'Unstar' : 'Star'}
                onClick={() => action((api) => api.setStarred(c.id, !starred))}
              >
                <Star className={cn(starred ? 'fill-star text-star' : 'text-muted-foreground')} />
              </Button>
            </li>
          );
        })}
      </ul>
      {listed.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          No starred cards yet — star the hard ones while you study.
        </p>
      )}
    </section>
  );
}
