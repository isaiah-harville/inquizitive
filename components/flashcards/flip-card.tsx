'use client';

import type { CardMedia, CardSide } from '@/domain/models';
import { cn } from '@/lib/utils';
import { CardImage } from './card-image';
import { RichText } from './rich-text';

export interface FaceContent {
  text: string;
  media?: CardMedia[];
  side: CardSide;
  label?: string;
}

/** Text that shrinks gracefully as content grows, so short terms feel big and long definitions still fit. */
function sizeClass(text: string): string {
  const n = text.length;
  if (n < 30) return 'text-3xl sm:text-4xl';
  if (n < 90) return 'text-2xl sm:text-3xl';
  if (n < 240) return 'text-xl sm:text-2xl';
  return 'text-base sm:text-lg';
}

export function CardFace({ content, className }: { content: FaceContent; className?: string }) {
  const image = content.media?.find((m) => m.side === content.side);
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-4 overflow-auto p-6 text-center sm:p-10',
        className,
      )}
    >
      {content.label && (
        <span className="absolute top-4 left-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {content.label}
        </span>
      )}
      {image && <CardImage path={image.relativePath} className="max-h-[45%] w-auto max-w-full" />}
      {content.text && (
        <RichText
          text={content.text}
          className={cn('font-medium leading-snug', sizeClass(content.text))}
        />
      )}
    </div>
  );
}

/**
 * A large flashcard that flips in 3D. It is a single button so click, tap,
 * Enter and Space all flip it.
 */
export function FlipCard({
  front,
  back,
  flipped,
  onFlip,
  className,
}: {
  front: FaceContent;
  back: FaceContent;
  flipped: boolean;
  onFlip: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flip-scene', className)}>
      <button
        type="button"
        onClick={onFlip}
        data-flipped={flipped}
        aria-label={
          flipped ? 'Showing answer. Flip to question' : 'Showing question. Flip to answer'
        }
        className="flip-card relative h-full w-full cursor-pointer rounded-3xl text-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <div className="flip-face absolute inset-0 card-raised rounded-3xl">
          <CardFace content={front} />
        </div>
        <div className="flip-face flip-back absolute inset-0 card-raised rounded-3xl">
          <CardFace content={back} />
        </div>
      </button>
    </div>
  );
}
