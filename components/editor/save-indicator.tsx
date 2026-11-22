'use client';

import { Check, CloudOff, Loader2 } from 'lucide-react';
import type { SaveStatus } from '@/hooks/use-autosave';

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </span>
    );
  if (status === 'error')
    return (
      <span className="flex items-center gap-1.5 text-destructive text-sm">
        <CloudOff className="size-3.5" /> Not saved
      </span>
    );
  if (status === 'saved')
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <Check className="size-3.5 text-success" /> All changes saved
      </span>
    );
  return <span className="text-muted-foreground text-sm">Changes save automatically</span>;
}

export function focusCard(id: string, field: 'front' | 'back' = 'front', immediate = false) {
  const go = () => {
    const el = document.querySelector<HTMLTextAreaElement>(
      `[data-card-id="${id}"] [data-field="${field}"]`,
    );
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  if (immediate) go();
  else requestAnimationFrame(go);
}
