'use client';

import { useMemo } from 'react';
import { currentStreak, longestStreak, previousDay } from '@/domain/stats';
import { endOfDay, localDayKey, startOfDay, tzOffsetMs } from '@/lib/format';
import { useApiQuery } from './use-api';

/** Stats for the last `days` days, plus streaks computed in local time. */
export function useStats(days = 30) {
  const query = useApiQuery(['stats', days], (api) =>
    api.getStats({
      tzOffsetMs: tzOffsetMs(),
      days,
      startOfDay: startOfDay(),
      endOfDay: endOfDay(),
    }),
  );
  const derived = useMemo(() => {
    const activity = query.data?.activity ?? [];
    const active = new Set(activity.filter((a) => a.count > 0).map((a) => a.day));
    const today = localDayKey(Date.now());
    const series: { day: string; count: number }[] = [];
    const counts = new Map(activity.map((a) => [a.day, a.count]));
    let d = today;
    for (let i = 0; i < days; i++) {
      series.unshift({ day: d, count: counts.get(d) ?? 0 });
      d = previousDay(d);
    }
    return {
      streak: currentStreak(active, today, previousDay),
      longest: longestStreak([...active], previousDay),
      studiedToday: active.has(today),
      series,
    };
  }, [query.data, days]);
  return { ...query, ...derived };
}
