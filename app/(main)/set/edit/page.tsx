'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CheckSquare, Plus, Rows3, Rows4, Trash2, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { type CardField, CardRow, type EditableCard } from '@/components/editor/card-row';
import { focusCard, SaveIndicator } from '@/components/editor/save-indicator';
import { SetMetaFields } from '@/components/editor/set-meta-fields';
import { useConfirm } from '@/components/layout/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { CardSide } from '@/domain/models';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { useAutosave } from '@/hooks/use-autosave';
import { plural } from '@/lib/format';
import { getApi } from '@/services/api/client';
import { storeImage } from '@/services/platform';

function Editor() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const isNew = params.get('new') === '1';
  const router = useRouter();
  const action = useAction();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, error } = useApiQuery(['set', id], (api) => api.getSet(id), {
    enabled: !!id,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { schedule, now, flush, status } = useAutosave();
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup only
  useEffect(() => () => void queryClient.invalidateQueries(), []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cards, setCards] = useState<EditableCard[]>([]);
  const [compact, setCompact] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const loaded = useRef(false);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setTitle(data.set.title);
    setDescription(data.set.description);
    setCards(
      data.cards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        explanation: c.explanation,
        acceptedAnswers: c.acceptedAnswers,
        media: c.media,
      })),
    );
    if (data.cards.length > 60) setCompact(true);
  }, [data]);

  const seeded = useRef(false);
  useEffect(() => {
    if (!isNew || !data || seeded.current || data.cards.length > 0) return;
    seeded.current = true;
    (async () => {
      const api = await getApi();
      const ids = await api.insertCards(id, [
        { front: '', back: '' },
        { front: '', back: '' },
      ]);
      setCards(
        ids.map((cid) => ({
          id: cid,
          front: '',
          back: '',
          explanation: '',
          acceptedAnswers: [],
          media: [],
        })),
      );
    })().catch((e) => toast.error("Couldn't add cards", { description: String(e) }));
  }, [isNew, data, id]);

  const saveSetField = (patch: { title?: string; description?: string }) =>
    schedule(`set:${Object.keys(patch)[0]}`, async () => (await getApi()).updateSet(id, patch));

  const onChange = useCallback(
    (cardId: string, field: CardField, value: string | string[]) => {
      setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, [field]: value } : c)));
      schedule(`card:${cardId}:${field}`, async () =>
        (await getApi()).updateCard(cardId, { [field]: value }),
      );
    },
    [schedule],
  );

  const addAfter = useCallback(
    (afterId?: string) => {
      const last = afterId ?? cardsRef.current.at(-1)?.id;
      const newId = crypto.randomUUID();
      // Commit synchronously so focus moves within the same key press — fast typists never lose keystrokes.
      flushSync(() =>
        setCards((cs) => {
          const blank: EditableCard = {
            id: newId,
            front: '',
            back: '',
            explanation: '',
            acceptedAnswers: [],
            media: [],
          };
          const i = last ? cs.findIndex((c) => c.id === last) : -1;
          return i < 0 ? [...cs, blank] : [...cs.slice(0, i + 1), blank, ...cs.slice(i + 1)];
        }),
      );
      focusCard(newId, 'front', true);
      void now(`create:${newId}`, async () => {
        await (await getApi()).createCard(id, { front: '', back: '' }, last, newId);
      });
    },
    [now, id],
  );

  const tabFromBack = useCallback(
    (cardId: string) => {
      const cs = cardsRef.current;
      const i = cs.findIndex((c) => c.id === cardId);
      if (i >= 0 && i < cs.length - 1) focusCard(cs[i + 1].id, 'front', true);
      else addAfter(cardId);
    },
    [addAfter],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      const nonEmpty = cardsRef.current.filter((c) => ids.includes(c.id) && (c.front || c.back));
      if (
        nonEmpty.length > 1 &&
        !(await confirm({
          title: `Delete ${plural(ids.length, 'card')}?`,
          description: "Their study progress is deleted too. This can't be undone.",
          confirmLabel: 'Delete',
          destructive: true,
        }))
      )
        return;
      setCards((cs) => cs.filter((c) => !ids.includes(c.id)));
      setSelected(new Set());
      await action((api) => api.deleteCards(ids), {
        refresh: false,
        success: ids.length > 1 ? `Deleted ${ids.length} cards` : undefined,
      });
    },
    [action, confirm],
  );

  const duplicate = useCallback(
    async (cardId: string) => {
      await flush();
      const newId = await action((api) => api.duplicateCard(cardId), { refresh: false });
      setCards((cs) => {
        const i = cs.findIndex((c) => c.id === cardId);
        const copy = { ...cs[i], id: newId };
        return [...cs.slice(0, i + 1), copy, ...cs.slice(i + 1)];
      });
    },
    [action, flush],
  );

  const onImage = useCallback(
    async (cardId: string, side: CardSide, file: File | null) => {
      try {
        if (!file) {
          await action((api) => api.setCardMedia(cardId, side, null), { refresh: false });
          setCards((cs) =>
            cs.map((c) =>
              c.id === cardId ? { ...c, media: c.media.filter((m) => m.side !== side) } : c,
            ),
          );
          return;
        }
        const stored = await storeImage(file);
        await action((api) => api.setCardMedia(cardId, side, stored.path, stored.mimeType), {
          refresh: false,
        });
        setCards((cs) =>
          cs.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  media: [
                    ...c.media.filter((m) => m.side !== side),
                    {
                      id: stored.path,
                      flashcardId: cardId,
                      side,
                      relativePath: stored.path,
                      mimeType: stored.mimeType,
                    },
                  ],
                }
              : c,
          ),
        );
      } catch (e) {
        toast.error("Couldn't add image", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [action],
  );

  const toggleSelect = useCallback((cardId: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = cards.findIndex((c) => c.id === e.active.id);
    const to = cards.findIndex((c) => c.id === e.over?.id);
    const next = arrayMove(cards, from, to);
    setCards(next);
    schedule('order', async () =>
      (await getApi()).reorderCards(
        id,
        next.map((c) => c.id),
      ),
    );
  };

  const done = async () => {
    await flush();
    const blanks = cardsRef.current
      .filter((c) => !c.front.trim() && !c.back.trim() && c.media.length === 0)
      .map((c) => c.id);
    if (blanks.length) await action((api) => api.deleteCards(blanks), { refresh: false });
    await queryClient.invalidateQueries();
    router.push(`/set/?id=${id}`);
  };

  if (error) return <div className="p-10 text-center text-muted-foreground">{error.message}</div>;
  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-20" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!data.canEdit) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Only the owner can edit this set.
      </div>
    );
  }

  const blankCount = cards.filter((c) => !c.front.trim() && !c.back.trim()).length;

  return (
    <div className="pb-24">
      <div className="sticky top-16 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-8">
          <SaveIndicator status={status} />
          <div className="flex-1" />
          <Button variant="ghost" asChild>
            <Link href={`/import/?set=${id}`}>
              <Upload /> Import
            </Link>
          </Button>
          <Button onClick={done}>Done</Button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <div className="grid gap-5">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              saveSetField({ title: e.target.value });
            }}
            placeholder="Set title"
            aria-label="Set title"
            className="h-auto border-0 border-b-2 rounded-none bg-transparent px-0 py-2 font-semibold text-2xl shadow-none focus-visible:border-primary focus-visible:ring-0 sm:text-3xl dark:bg-transparent"
            maxLength={300}
            autoFocus={isNew}
          />
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              saveSetField({ description: e.target.value });
            }}
            placeholder="Add a description…"
            aria-label="Description"
            rows={2}
          />
          <SetMetaFields set={data.set} />
        </div>

        <div className="sticky top-30 z-10 -mx-2 mt-10 mb-3 flex flex-wrap items-center gap-2 bg-background/90 px-2 py-2 backdrop-blur">
          <h2 className="font-semibold">{plural(cards.length, 'card')}</h2>
          {blankCount > 0 && (
            <span className="text-muted-foreground text-sm">({blankCount} empty)</span>
          )}
          <div className="flex-1" />
          {selecting ? (
            <>
              <span className="text-muted-foreground text-sm">{selected.size} selected</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelected(
                    selected.size === cards.length ? new Set() : new Set(cards.map((c) => c.id)),
                  )
                }
              >
                {selected.size === cards.length ? 'Select none' : 'Select all'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selected.size}
                onClick={async () => {
                  await flush();
                  await action((api) => api.swapSides([...selected]), {
                    refresh: false,
                    success: 'Swapped terms and definitions',
                  });
                  setCards((cs) =>
                    cs.map((c) =>
                      selected.has(c.id) ? { ...c, front: c.back, back: c.front } : c,
                    ),
                  );
                }}
              >
                <ArrowLeftRight /> Swap sides
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!selected.size}
                onClick={() => remove([...selected])}
              >
                <Trash2 /> Delete
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Stop selecting"
                onClick={() => {
                  setSelecting(false);
                  setSelected(new Set());
                }}
              >
                <X />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSelecting(true)}>
                <CheckSquare /> Select
              </Button>
              <ToggleGroup
                type="single"
                value={compact ? 'compact' : 'expanded'}
                onValueChange={(v) => v && setCompact(v === 'compact')}
                size="sm"
                variant="outline"
              >
                <ToggleGroupItem value="expanded" aria-label="Expanded view">
                  <Rows3 />
                </ToggleGroupItem>
                <ToggleGroupItem value="compact" aria-label="Compact view">
                  <Rows4 />
                </ToggleGroupItem>
              </ToggleGroup>
            </>
          )}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-3">
              {cards.map((c, i) => (
                <CardRow
                  key={c.id}
                  card={c}
                  index={i}
                  compact={compact}
                  selecting={selecting}
                  selected={selected.has(c.id)}
                  onChange={onChange}
                  onAddAfter={addAfter}
                  onDelete={(cid) => remove([cid])}
                  onDuplicate={duplicate}
                  onToggleSelect={toggleSelect}
                  onImage={onImage}
                  onTabFromBack={tabFromBack}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          onClick={() => addAfter()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="size-4" /> Add card
          <span className="hidden text-xs sm:inline">
            · or press <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> in any card
          </span>
        </button>
      </div>
    </div>
  );
}

export default function EditSetPage() {
  return (
    <Suspense fallback={null}>
      <Editor />
    </Suspense>
  );
}
