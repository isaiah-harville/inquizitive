'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced, per-key autosave. Each key (e.g. a card id) saves at most once
 * per `delay` after the last change; `flush()` saves everything immediately.
 * Leaving the page with unsaved changes triggers the browser's warning.
 */
export function useAutosave(delay = 600) {
  const timers = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }>(),
  );
  const inflight = useRef(0);
  // All saves run one after another, so e.g. "create card" always lands before its first edit.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<SaveStatus>('idle');

  const execute = useCallback((key: string, run: () => Promise<void>) => {
    timers.current.delete(key);
    inflight.current++;
    setStatus('saving');
    chain.current = chain.current.then(async () => {
      try {
        await run();
        inflight.current--;
        if (inflight.current === 0 && timers.current.size === 0) setStatus('saved');
      } catch (e) {
        inflight.current--;
        setStatus('error');
        toast.error("Couldn't save your change", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
    return chain.current;
  }, []);

  /** Save immediately (still in order with everything else). */
  const now = useCallback(
    (key: string, run: () => Promise<void>) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing.timer);
      return execute(key, run);
    },
    [execute],
  );

  const schedule = useCallback(
    (key: string, run: () => Promise<void>) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing.timer);
      setStatus('saving');
      const timer = setTimeout(() => void execute(key, run), delay);
      timers.current.set(key, { timer, run });
    },
    [delay, execute],
  );

  const flush = useCallback(async () => {
    const pending = [...timers.current.entries()];
    for (const [key, { timer, run }] of pending) {
      clearTimeout(timer);
      void execute(key, run);
    }
    await chain.current;
  }, [execute]);

  const hasPending = () => timers.current.size > 0 || inflight.current > 0;

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (timers.current.size > 0 || inflight.current > 0) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void flush(); // save on in-app navigation away
    };
  }, [flush]);

  return { schedule, now, flush, status, hasPending };
}
