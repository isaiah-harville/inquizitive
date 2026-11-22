import { cn } from '@/lib/utils';

/** The Inquizitive mark: a card with a question-mark curl. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
        <rect x="3" y="5" width="22" height="22" rx="6" className="fill-primary/15" />
        <rect x="7" y="3" width="22" height="22" rx="6" className="fill-primary" />
        <path
          d="M14.2 10.4a4 4 0 0 1 7.6 1.7c0 2.6-3.3 3-3.3 5.2"
          className="stroke-primary-foreground"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="18.5" cy="20.6" r="1.5" className="fill-primary-foreground" />
      </svg>
      {withText && <span className="text-[1.05rem]">Inquizitive</span>}
    </span>
  );
}
