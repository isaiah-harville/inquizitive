'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { StudyCard, StudyMode, StudySession } from '@/domain/models';
import { getApi } from '@/services/api/client';
import { toStudyCard } from '@/services/repositories/cards';
import type { AttemptDraft } from '@/services/repositories/sessions';
import { useApiQuery } from './use-api';

/** A set's cards (non-blank) prepared for study algorithms. */
export function useStudySet(setId: string) {
  const query = useApiQuery(['set', setId], (api) => api.getSet(setId), { enabled: !!setId });
  const cards = useMemo<StudyCard[]>(
    () => (query.data?.cards ?? []).filter((c) => c.front.trim() || c.back.trim()).map(toStudyCard),
    [query.data],
  );
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const full = useMemo(
    () => new Map((query.data?.cards ?? []).map((c) => [c.id, c])),
    [query.data],
  );
  return { ...query, cards, byId, full };
}

interface Versioned {
  version: number;
}

/**
 * Persisted study-session state. Resumes the latest unfinished session for
 * this set/mode if there is one; every `commit` saves state (and attempts) in
 * order, so closing the app mid-session loses nothing.
 */
export function useStudySession<S extends Versioned>(
  setId: string,
  mode: StudyMode,
  version: number,
) {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<S | null>(null);
  const [ready, setReady] = useState(false);
  const [resumed, setResumed] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!setId) return;
    let live = true;
    (async () => {
      const api = await getApi();
      const active = (await api.findActiveSession(setId, mode)) as StudySession<S> | null;
      if (!live) return;
      if (active && (active.state as Versioned)?.version === version) {
        setSessionId(active.id);
        setState(active.state);
        setResumed(true);
      }
      setReady(true);
    })().catch((e) => {
      toast.error("Couldn't load your session", { description: String(e) });
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [setId, mode, version]);

  const enqueue = useCallback((fn: () => Promise<unknown>) => {
    queue.current = queue.current.then(fn).catch((e) => {
      toast.error("Couldn't save your progress", {
        description: e instanceof Error ? e.message : String(e),
      });
    });
    return queue.current;
  }, []);

  /** Begin a fresh session (replaces any unfinished one). */
  const start = useCallback(
    async (initial: S) => {
      setState(initial);
      setResumed(false);
      const api = await getApi();
      const id = await api.createSession(setId, mode, initial);
      setSessionId(id);
      return id;
    },
    [setId, mode],
  );

  const commit = useCallback(
    (next: S, opts: { attempts?: AttemptDraft[]; completed?: boolean } = {}) => {
      setState(next);
      const id = sessionId;
      if (!id) return Promise.resolve();
      return enqueue(async () => {
        await (await getApi()).saveSession(id, next, opts);
        if (opts.completed) void qc.invalidateQueries();
      });
    },
    [sessionId, enqueue, qc],
  );

  const discard = useCallback(async () => {
    if (sessionId) await enqueue(async () => (await getApi()).discardSession(sessionId));
    setSessionId(null);
    setState(null);
    setResumed(false);
  }, [sessionId, enqueue]);

  return { state, ready, resumed, sessionId, start, commit, discard };
}

/** Global keyboard shortcuts while a study screen is active (ignored while typing). */
export function useHotkeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
