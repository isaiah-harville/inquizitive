'use client';

import { FileText, Layers, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useApiQuery } from '@/hooks/use-api';
import { plural } from '@/lib/format';

/** Global search (⌘K / Ctrl+K): sets, tags and individual cards, fully offline. */
export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());
  const { data, isFetching } = useApiQuery(['search', q], (api) => api.search(q, 12), {
    enabled: open && q.length > 0,
  });

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search study sets and cards</DialogDescription>
        <Command shouldFilter={false} className="[&_[cmdk-input-wrapper]]:h-12">
          <CommandInput
            placeholder="Search sets, tags and cards…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[60vh]">
            {q.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
                <Search className="size-5" />
                Type to search your library
              </div>
            ) : (
              <CommandEmpty>{isFetching ? 'Searching…' : `No results for “${q}”`}</CommandEmpty>
            )}
            {!!data?.sets.length && (
              <CommandGroup heading="Study sets">
                {data.sets.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`set-${s.id}`}
                    onSelect={() => go(`/set/?id=${s.id}`)}
                  >
                    <Layers className="text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.title}</div>
                      <div className="truncate text-muted-foreground text-xs">
                        {plural(s.cardCount, 'card')}
                        {s.description ? ` · ${s.description}` : ''}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.cards.length && (
              <CommandGroup heading="Cards">
                {data.cards.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`card-${c.id}`}
                    onSelect={() => go(`/set/?id=${c.setId}&card=${c.id}`)}
                  >
                    <FileText className="text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        <span className="font-medium">{c.front}</span>
                        <span className="text-muted-foreground"> — {c.back}</span>
                      </div>
                      <div className="truncate text-muted-foreground text-xs">in {c.setTitle}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
