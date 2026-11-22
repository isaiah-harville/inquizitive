'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function StudyHeader({
  setId,
  title,
  mode,
  progress,
  progressLabel,
  actions,
}: {
  setId?: string | null;
  title: string;
  mode: string;
  progress?: number;
  progressLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <span className="rounded-md bg-primary/12 px-2 py-0.5 font-semibold text-primary text-xs uppercase tracking-wider">
          {mode}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {progressLabel && (
          <span className="hidden text-muted-foreground text-sm tabular-nums sm:block">
            {progressLabel}
          </span>
        )}
        {actions}
        <Button variant="ghost" size="icon" asChild aria-label="Exit (progress is saved)">
          <Link href={setId ? `/set/?id=${setId}` : '/review/'}>
            <X />
          </Link>
        </Button>
      </div>
      {progress !== undefined && (
        <div className="h-1 bg-muted">
          <div
            className={cn('h-full bg-primary transition-[width] duration-500')}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </header>
  );
}

export function StudyMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-semibold text-xl">{title}</h1>
      {children}
    </div>
  );
}

/** Large answer target used by multiple choice / true-false. */
export function ChoiceButton({
  index,
  state,
  children,
  ...props
}: React.ComponentProps<'button'> & {
  index?: number;
  state?: 'correct' | 'wrong' | 'dim' | 'idle';
}) {
  return (
    <button
      type="button"
      className={cn(
        'group flex min-h-16 w-full items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 text-left transition-all',
        'hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default',
        state === 'correct' &&
          'border-success bg-success/10 hover:border-success hover:bg-success/10',
        state === 'wrong' &&
          'border-destructive bg-destructive/10 hover:border-destructive hover:bg-destructive/10',
        state === 'dim' && 'opacity-50 hover:border-border hover:bg-card',
      )}
      {...props}
    >
      {index !== undefined && (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border font-medium text-muted-foreground text-xs group-hover:border-primary/40">
          {index}
        </span>
      )}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
