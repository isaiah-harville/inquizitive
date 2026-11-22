'use client';

import { FolderClosed, Layers, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { NewSetDialog } from '@/components/layout/new-set-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SetSort } from '@/domain/models';
import { useApiQuery } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { SetCard, SetGrid, SetGridSkeleton } from './set-card';

const SORT_LABELS: Record<SetSort, string> = {
  updated: 'Last modified',
  studied: 'Recently studied',
  created: 'Date created',
  title: 'Name',
};

export function SetBrowser({ scope }: { scope: 'mine' | 'shared' | 'studied' }) {
  const params = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const folderId = params.get('folder') ?? undefined;
  const tag = params.get('tag') ?? undefined;
  const view = (params.get('view') as 'active' | 'archived' | null) ?? 'active';
  const [sort, setSort] = useState<SetSort>(scope === 'studied' ? 'studied' : 'updated');
  const [filter, setFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const opts = {
    scope,
    folderId: scope === 'mine' ? folderId : undefined,
    tag,
    sort,
    archived: view === 'archived' ? ('only' as const) : ('exclude' as const),
  };
  const { data: sets, isLoading } = useApiQuery(['sets', opts], (api) => api.listSets(opts));
  const { data: folders } = useApiQuery(['folders'], (api) => api.listFolders(), {
    enabled: scope === 'mine',
  });
  const { data: tags } = useApiQuery(['tags'], (api) => api.listTags());
  const folder = folders?.find((f) => f.id === folderId);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sets ?? [];
    return (sets ?? []).filter((s) =>
      `${s.title} ${s.description} ${s.tags.join(' ')}`.toLowerCase().includes(q),
    );
  }, [sets, filter]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`?${next.toString()}`);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {scope === 'mine' && (
          <Tabs value={view} onValueChange={(v) => setParam('view', v === 'active' ? null : v)}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filter sets"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter sets"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SetSort)}>
          <SelectTrigger className="w-44" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SetSort[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {scope === 'mine' && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus /> New set
          </Button>
        )}
      </div>

      {(folder || tag) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {folder && (
            <Badge variant="secondary" className="gap-1.5 py-1 pr-1 pl-2">
              <FolderClosed className="size-3.5" /> {folder.name}
              <button
                type="button"
                className="rounded p-0.5 hover:bg-background/60"
                onClick={() => setParam('folder', null)}
                aria-label="Clear folder filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {tag && (
            <Badge variant="secondary" className="gap-1.5 py-1 pr-1 pl-2">
              #{tag}
              <button
                type="button"
                className="rounded p-0.5 hover:bg-background/60"
                onClick={() => setParam('tag', null)}
                aria-label="Clear tag filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {!!tags?.length && !tag && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {tags.slice(0, 20).map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setParam('tag', t.name)}
              className="rounded-full border px-2.5 py-0.5 text-muted-foreground text-xs transition-colors hover:border-primary/50 hover:text-foreground"
            >
              #{t.name} <span className="opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <SetGridSkeleton />
      ) : visible.length === 0 ? (
        <Empty className="rounded-2xl border border-dashed bg-dots py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>
              {filter || tag || folder
                ? 'No matching sets'
                : scope === 'shared'
                  ? 'Nothing shared yet'
                  : scope === 'studied'
                    ? 'Nothing studied yet'
                    : view === 'archived'
                      ? 'No archived sets'
                      : 'No study sets yet'}
            </EmptyTitle>
            <EmptyDescription>
              {scope === 'shared'
                ? 'When someone on this server shares a set with everyone, it shows up here.'
                : scope === 'studied'
                  ? 'Sets you study will appear here, most recent first.'
                  : 'Create a set, or import cards from text, CSV or another app.'}
            </EmptyDescription>
          </EmptyHeader>
          {scope === 'mine' && view === 'active' && !filter && (
            <EmptyContent className="flex-row justify-center">
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> New set
              </Button>
              <Button variant="outline" asChild>
                <Link href="/import/">Import</Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <SetGrid>
          {visible.map((s) => (
            <SetCard key={s.id} set={s} showOwner={s.ownerId !== session?.user?.id} />
          ))}
        </SetGrid>
      )}
      <NewSetDialog open={newOpen} onOpenChange={setNewOpen} folderId={folderId ?? null} />
    </>
  );
}
