'use client';

import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { mediaUrl } from '@/services/platform';

export function CardImage({
  path,
  className,
  alt = '',
}: {
  path: string;
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    mediaUrl(path).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [path]);
  if (src === undefined)
    return <div className={cn('animate-pulse rounded-lg bg-muted', className)} />;
  if (src === null) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-muted text-muted-foreground',
          className,
        )}
      >
        <ImageOff className="size-5" aria-label="Image missing" />
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: blob and local media URLs; next/image can't optimize them offline
    <img
      src={src}
      alt={alt}
      className={cn('rounded-lg object-contain', className)}
      draggable={false}
    />
  );
}
