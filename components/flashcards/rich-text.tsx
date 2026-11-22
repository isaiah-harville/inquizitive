'use client';

import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { cn } from '@/lib/utils';

/** Characters that suggest Markdown/LaTeX; anything else renders as plain text (fast path). */
const MARKUP = /[*_`#>$[\]|~\\]|^\s*[-+]\s|^\s*\d+\.\s|\n\s*\n/m;

/**
 * Card content renderer. Raw HTML is never rendered (react-markdown escapes
 * it), and nothing external is ever fetched: images in Markdown are not
 * loaded and links are shown as text with their address.
 */
const components: Components = {
  img: ({ alt, src }) => (
    <span
      className="rounded border border-dashed px-1.5 py-0.5 text-muted-foreground text-xs"
      title={String(src ?? '')}
    >
      🖼 {alt || 'external image (not loaded)'}
    </span>
  ),
  a: ({ children, href }) => (
    <span className="underline decoration-dotted underline-offset-2" title={href}>
      {children}
    </span>
  ),
};

export const RichText = memo(function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!MARKUP.test(text)) {
    return <span className={cn('rich-text whitespace-pre-wrap', className)}>{text}</span>;
  }
  return (
    <div className={cn('rich-text', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false, strict: 'ignore', trust: false }],
          [rehypeHighlight, { detect: false }],
        ]}
        components={components}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
