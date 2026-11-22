import { cn } from '@/lib/utils';

/** Tiny daily-activity bar chart (no chart library needed). */
export function ActivityBars({
  series,
  className,
}: {
  series: { day: string; count: number }[];
  className?: string;
}) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div
      className={cn('flex items-end gap-1', className)}
      role="img"
      aria-label="Study activity per day"
    >
      {series.map((s) => (
        <div key={s.day} className="group relative flex h-full flex-1 items-end">
          <div
            className={cn(
              'w-full rounded-sm transition-all',
              s.count > 0 ? 'bg-primary/80 group-hover:bg-primary' : 'bg-muted',
            )}
            style={{ height: `${Math.max(8, (s.count / max) * 100)}%` }}
          />
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[0.7rem] shadow group-hover:block">
            {s.day}: {s.count}
          </span>
        </div>
      ))}
    </div>
  );
}
