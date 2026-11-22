'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CardImage } from '@/components/flashcards/card-image';
import { RichText } from '@/components/flashcards/rich-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import type { GradeResult } from '@/domain/grading/grade';
import type { Flashcard } from '@/domain/models';
import { type CardQuestion, otherSide } from '@/domain/study/questions';
import { cn } from '@/lib/utils';
import { ChoiceButton } from './study-header';

const TYPE_LABEL: Record<CardQuestion['type'], string> = {
  multiple_choice: 'Choose the answer',
  true_false: 'True or false?',
  written: 'Type the answer',
  flashcard: 'Recall the answer',
};

export function questionInstruction(q: CardQuestion): string {
  const side = q.answerSide === 'back' ? 'definition' : 'term';
  if (q.type === 'true_false') return 'Is this pairing correct?';
  if (q.type === 'written') return `Type the ${side}`;
  if (q.type === 'multiple_choice') return `Choose the matching ${side}`;
  return TYPE_LABEL[q.type];
}

/** The prompt side of a card: text plus its image, if any. */
export function QuestionPrompt({
  q,
  card,
  size = 'lg',
}: {
  q: CardQuestion;
  card?: Flashcard;
  size?: 'lg' | 'md';
}) {
  const img = card?.media.find((m) => m.side === otherSide(q.answerSide));
  return (
    <div className="flex flex-col gap-3">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {q.answerSide === 'back' ? 'Term' : 'Definition'}
      </span>
      {img && <CardImage path={img.relativePath} className="max-h-48 w-auto self-start" />}
      <RichText
        text={q.prompt}
        className={cn(
          'font-medium leading-snug',
          size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-lg',
        )}
      />
    </div>
  );
}

export interface Feedback {
  correct: boolean;
  response: string;
  grade?: GradeResult;
}

/**
 * Answer controls for one question. Calls `onAnswer(response)`; when
 * `feedback` is set, shows the result instead of accepting input.
 */
export function AnswerControls({
  q,
  feedback,
  onAnswer,
  hotkeys = true,
}: {
  q: CardQuestion;
  feedback: Feedback | null;
  onAnswer: (response: string) => void;
  hotkeys?: boolean;
}) {
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per question
  useEffect(() => {
    setText('');
    setRevealed(false);
    if (q.type === 'written') requestAnimationFrame(() => inputRef.current?.focus());
  }, [q.id]);

  useEffect(() => {
    if (!hotkeys || feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (q.type === 'multiple_choice') {
        const i = Number(e.key) - 1;
        if (i >= 0 && i < q.choices.length) onAnswer(q.choices[i].id);
      } else if (q.type === 'true_false') {
        if (e.key === '1' || e.key.toLowerCase() === 't') onAnswer('true');
        if (e.key === '2' || e.key.toLowerCase() === 'f') onAnswer('false');
      } else if (q.type === 'flashcard') {
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          setRevealed(true);
        } else if (revealed && e.key === '1') onAnswer('unknown');
        else if (revealed && e.key === '2') onAnswer('known');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, feedback, hotkeys, onAnswer, revealed]);

  if (q.type === 'multiple_choice') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {q.choices.map((c, i) => {
          const state = !feedback
            ? 'idle'
            : c.id === q.correctChoiceId
              ? 'correct'
              : c.id === feedback.response
                ? 'wrong'
                : 'dim';
          return (
            <ChoiceButton
              key={c.id}
              index={i + 1}
              state={state}
              disabled={!!feedback}
              onClick={() => onAnswer(c.id)}
            >
              <RichText text={c.text} />
            </ChoiceButton>
          );
        })}
      </div>
    );
  }

  if (q.type === 'true_false') {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border bg-muted/40 p-4">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {q.answerSide === 'back' ? 'Definition' : 'Term'}
          </span>
          <RichText text={q.shown} className="mt-1 text-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['true', 'false'] as const).map((v, i) => {
            const isRight = (v === 'true') === q.isTrue;
            const state = !feedback
              ? 'idle'
              : isRight
                ? 'correct'
                : feedback.response === v
                  ? 'wrong'
                  : 'dim';
            return (
              <ChoiceButton
                key={v}
                index={i + 1}
                state={state}
                disabled={!!feedback}
                onClick={() => onAnswer(v)}
              >
                <span className="font-medium">{v === 'true' ? 'True' : 'False'}</span>
              </ChoiceButton>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === 'written') {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!feedback && text.trim()) onAnswer(text);
        }}
      >
        <Input
          ref={inputRef}
          value={feedback ? feedback.response : text}
          onChange={(e) => setText(e.target.value)}
          disabled={!!feedback}
          placeholder="Type your answer"
          aria-label="Your answer"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            'h-12 text-lg',
            feedback?.correct && 'border-success bg-success/10',
            feedback &&
              !feedback.correct &&
              'border-destructive bg-destructive/10 line-through decoration-destructive/60',
          )}
        />
        {!feedback && (
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => onAnswer('')}>
              Don't know?
            </Button>
            <Button type="submit" disabled={!text.trim()}>
              Answer <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">↵</Kbd>
            </Button>
          </div>
        )}
      </form>
    );
  }

  return !revealed && !feedback ? (
    <Button size="lg" variant="outline" className="h-14 w-full" onClick={() => setRevealed(true)}>
      Show answer <Kbd className="ml-1">Space</Kbd>
    </Button>
  ) : (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-muted/40 p-4">
        <RichText text={q.answer} className="text-lg" />
      </div>
      {!feedback && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="outline"
            className="h-12 border-warning/60 hover:bg-warning/10"
            onClick={() => onAnswer('unknown')}
          >
            <X /> Didn't know <Kbd className="ml-1">1</Kbd>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 border-success/60 hover:bg-success/10"
            onClick={() => onAnswer('known')}
          >
            <Check /> Got it <Kbd className="ml-1">2</Kbd>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Result banner after answering, with the correct answer and explanation. */
export function FeedbackPanel({
  q,
  feedback,
  onOverride,
}: {
  q: CardQuestion;
  feedback: Feedback;
  onOverride?: () => void;
}) {
  const almost = feedback.grade?.verdict === 'almost';
  return (
    <div
      aria-live="polite"
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-4',
        feedback.correct
          ? 'border-success/50 bg-success/8'
          : 'border-destructive/40 bg-destructive/6',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 font-semibold',
          feedback.correct ? 'text-success' : 'text-destructive',
        )}
      >
        {feedback.correct ? <Check className="size-5" /> : <X className="size-5" />}
        {feedback.correct
          ? almost
            ? 'Correct — watch the spelling'
            : 'Correct!'
          : feedback.response
            ? 'Not quite'
            : "Let's learn this one"}
      </div>
      {(!feedback.correct || almost || q.type === 'true_false') && (
        <div className="text-sm">
          <span className="text-muted-foreground">Answer: </span>
          <RichText text={q.answer} className="inline font-medium" />
        </div>
      )}
      {q.explanation && <RichText text={q.explanation} className="text-muted-foreground text-sm" />}
      {!feedback.correct && q.type === 'written' && feedback.response && onOverride && (
        <Button variant="link" size="sm" className="h-auto w-fit p-0" onClick={onOverride}>
          Override: I was right
        </Button>
      )}
    </div>
  );
}
