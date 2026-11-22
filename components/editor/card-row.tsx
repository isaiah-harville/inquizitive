'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, ImagePlus, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { CardImage } from '@/components/flashcards/card-image';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CardMedia, CardSide } from '@/domain/models';
import { cn } from '@/lib/utils';

export interface EditableCard {
  id: string;
  front: string;
  back: string;
  explanation: string;
  acceptedAnswers: string[];
  media: CardMedia[];
}

export type CardField = 'front' | 'back' | 'explanation' | 'acceptedAnswers';

/** Textarea that grows with its content. */
function AutoTextarea({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<'textarea'>, 'onChange' | 'value'> & {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the value changes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full resize-none overflow-hidden border-0 border-b-2 border-input bg-transparent px-0 py-1.5 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary',
        className,
      )}
      {...props}
    />
  );
}

function AnswersInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-input border-b-2 py-1 focus-within:border-primary">
      {value.map((a) => (
        <span
          key={a}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground text-sm"
        >
          {a}
          <button
            type="button"
            aria-label={`Remove ${a}`}
            onClick={() => onChange(value.filter((x) => x !== a))}
            className="opacity-60 hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={value.length ? '' : 'Other accepted answers — press Enter after each'}
        className="min-w-40 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
        aria-label="Accepted alternative answers"
      />
    </div>
  );
}

function ImageSlot({
  media,
  onPick,
  onRemove,
  label,
}: {
  media?: CardMedia;
  onPick: (file: File) => void;
  onRemove: () => void;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      {media ? (
        <div className="group relative w-fit">
          <CardImage path={media.relativePath} className="h-20 w-auto border" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute -top-2 -right-2 hidden rounded-full border bg-background p-0.5 shadow group-hover:block"
            aria-label={`Remove ${label} image`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="w-fit text-muted-foreground"
          onClick={() => input.current?.click()}
        >
          <ImagePlus /> Image
        </Button>
      )}
    </>
  );
}

export interface CardRowProps {
  card: EditableCard;
  index: number;
  compact: boolean;
  selecting: boolean;
  selected: boolean;
  readOnly?: boolean;
  onChange: (id: string, field: CardField, value: string | string[]) => void;
  onAddAfter: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onImage: (id: string, side: CardSide, file: File | null) => void;
  /** Tab out of the definition: go to the next card (or create one). */
  onTabFromBack: (id: string) => void;
}

export const CardRow = memo(function CardRow(props: CardRowProps) {
  const { card, index, compact, selecting, selected } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const [showMore, setShowMore] = useState(!!card.explanation || card.acceptedAnswers.length > 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      props.onAddAfter(card.id);
    }
  };
  const frontImage = card.media.find((m) => m.side === 'front');
  const backImage = card.media.find((m) => m.side === 'back');

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-card-id={card.id}
      className={cn(
        'group/row relative card-raised shadow-xs transition-shadow',
        isDragging && 'z-10 shadow-xl ring-2 ring-primary/40',
        selected && 'border-primary/60 bg-primary/5',
      )}
      onKeyDown={onKeyDown}
    >
      <div className={cn('flex items-center gap-2 border-b px-3', compact ? 'py-1' : 'py-2')}>
        {selecting ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => props.onToggleSelect(card.id)}
            aria-label={`Select card ${index + 1}`}
          />
        ) : (
          <button
            type="button"
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag to reorder card ${index + 1}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <span className="font-medium text-muted-foreground text-sm tabular-nums">{index + 1}</span>
        <div className="flex-1" />
        {!compact && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setShowMore((s) => !s)}
          >
            {showMore ? 'Hide extras' : 'Answers & notes'}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Card ${index + 1} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => props.onAddAfter(card.id)}>
              <Plus /> Insert card below
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onDuplicate(card.id)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => props.onDelete(card.id)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Term and definition are adjacent in the DOM so Tab goes term → definition → next card. */}
      <div className={cn('grid gap-x-6 gap-y-1.5 px-4 sm:grid-cols-2', compact ? 'py-2' : 'py-4')}>
        <AutoTextarea
          data-field="front"
          value={card.front}
          onChange={(v) => props.onChange(card.id, 'front', v)}
          placeholder="Term"
          aria-label={`Card ${index + 1} term`}
          className={cn('order-1', compact ? 'text-sm' : 'text-base')}
        />
        <AutoTextarea
          data-field="back"
          value={card.back}
          onChange={(v) => props.onChange(card.id, 'back', v)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              props.onTabFromBack(card.id);
            }
          }}
          placeholder="Definition"
          aria-label={`Card ${index + 1} definition`}
          className={cn('order-3 sm:order-2', compact ? 'text-sm' : 'text-base')}
        />
        {!compact && (
          <div className="order-2 mb-2 flex flex-col gap-1.5 sm:order-3 sm:mb-0">
            <span className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
              Term
            </span>
            <ImageSlot
              label="term"
              media={frontImage}
              onPick={(f) => props.onImage(card.id, 'front', f)}
              onRemove={() => props.onImage(card.id, 'front', null)}
            />
          </div>
        )}
        {!compact && (
          <div className="order-4 flex flex-col gap-1.5">
            <span className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
              Definition
            </span>
            <ImageSlot
              label="definition"
              media={backImage}
              onPick={(f) => props.onImage(card.id, 'back', f)}
              onRemove={() => props.onImage(card.id, 'back', null)}
            />
          </div>
        )}
        {!compact && showMore && (
          <>
            <div className="order-5 mt-3 flex flex-col gap-1.5">
              <AnswersInput
                value={card.acceptedAnswers}
                onChange={(v) => props.onChange(card.id, 'acceptedAnswers', v)}
              />
              <span className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                Also accept (written answers)
              </span>
            </div>
            <div className="order-6 mt-3 flex flex-col gap-1.5">
              <AutoTextarea
                value={card.explanation}
                onChange={(v) => props.onChange(card.id, 'explanation', v)}
                placeholder="Why is this the answer? Shown after you answer."
                aria-label={`Card ${index + 1} explanation`}
                className="text-sm"
              />
              <span className="font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                Explanation / notes
              </span>
            </div>
          </>
        )}
      </div>
    </li>
  );
});
