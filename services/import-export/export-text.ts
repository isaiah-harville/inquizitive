import Papa from 'papaparse';
import type { Flashcard } from '@/domain/models';

/** CSV/TSV export with a header row; alternate answers are joined with "|". */
export function cardsToDelimited(cards: readonly Flashcard[], delimiter: ',' | '\t'): string {
  return Papa.unparse(
    {
      fields: ['term', 'definition', 'explanation', 'accepted_answers'],
      data: cards.map((c) => [c.front, c.back, c.explanation, c.acceptedAnswers.join('|')]),
    },
    {
      delimiter,
      newline: '\n',
      quotes: delimiter === ',' ? true : (v: unknown) => /[\t\n"]/.test(String(v)),
    },
  );
}

export function safeFileName(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[^\w\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'study-set'
  );
}
