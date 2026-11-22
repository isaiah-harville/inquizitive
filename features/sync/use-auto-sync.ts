'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { backend } from '@/services/api/client';
import { loadSyncSettings, syncNow } from '@/services/sync/desktop';

const INTERVAL_MS = 15 * 60_000;

/** On the desktop app, sync at launch and every 15 minutes while connected. */
export function useAutoSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (backend() !== 'desktop') return;
    let running = false;
    const tick = async () => {
      if (running || !(await loadSyncSettings())) return;
      running = true;
      try {
        const report = await syncNow();
        if (report.pulled || report.deletedHere) await queryClient.invalidateQueries();
      } catch (e) {
        console.warn('[inquizitive] background sync failed:', e);
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [queryClient]);
}
