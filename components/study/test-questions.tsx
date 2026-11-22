'use client';

import { useState } from 'react';
import { RichText } from '@/components/flashcards/rich-text';
import {
  AnswerControls,
  FeedbackPanel,
  QuestionPrompt,
  questionInstruction,
} from '@/components/study/question';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { gradeWritten } from '@/domain/grading/grade';
import type { Id } from '@/domain/models';
import type { CardQuestion, MatchingQuestion } from '@/domain/study/questions';
import { gradeQuestion } from '@/domain/study/test';
import { cn } from '@/lib/utils';

export function MatchingInput({
  q,
  value,
  onChange,
  locked,
  results,
}: {
  q: MatchingQuestion;
  value: Record<Id, Id>;
  onChange: (v: Record<Id, Id>) => void;
  locked: boolean;
  results?: Record<Id, boolean>;
}) {
  const letters = 'ABCDEFGHIJKL';
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <ol className="flex flex-col gap-2">
        {q.items.map((item) => {
          const ok = results?.[item.cardId];
          return (
            <li
              key={item.cardId}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3',
                ok === true && 'border-success bg-success/8',
                ok === false && 'border-destructive bg-destructive/6',
              )}
            >
              <RichText text={item.prompt} className="min-w-0 flex-1 text-sm" />
              <Select
                value={value[item.cardId] ?? ''}
                disabled={locked}
                onValueChange={(v) => onChange({ ...value, [item.cardId]: v })}
              >
                <SelectTrigger className="w-20" aria-label={`Match for ${item.prompt}`}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {q.options.map((o, i) => (
                    <SelectItem key={o.cardId} value={o.cardId}>
                      {letters[i]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ol>
      <ol className="flex flex-col gap-2">
        {q.options.map((o, i) => (
          <li key={o.cardId} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <span className="font-semibold text-primary">{letters[i]}</span>
            <RichText text={o.text} className="min-w-0 flex-1" />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CardQuestionBlock({
  q,
  card,
  response,
  showResult,
  onAnswer,
}: {
  q: CardQuestion;
  card: Parameters<typeof QuestionPrompt>[0]['card'];
  response: string | undefined;
  showResult: boolean;
  onAnswer: (r: string) => void;
}) {
  const feedback = showResult
    ? (() => {
        const r = response ?? '';
        if (q.type === 'written') {
          const grade = gradeWritten(r, q.acceptedAnswers);
          return { correct: grade.correct, response: r, grade };
        }
        return { correct: gradeQuestion(q, r).correct, response: r };
      })()
    : null;
  const selected = !showResult && response !== undefined;
  return (
    <>
      <QuestionPrompt q={q} card={card} size="md" />
      <div className="text-muted-foreground text-sm">{questionInstruction(q)}</div>
      {q.type === 'written' && !showResult ? (
        <WrittenTestInput value={response ?? ''} onChange={onAnswer} />
      ) : selected && (q.type === 'multiple_choice' || q.type === 'true_false') ? (
        <SelectedChoice q={q} response={response} onAnswer={onAnswer} />
      ) : (
        <AnswerControls
          q={q.type === 'flashcard' ? { ...q, type: 'written', acceptedAnswers: [q.answer] } : q}
          feedback={feedback}
          onAnswer={onAnswer}
          hotkeys={false}
        />
      )}
      {feedback && <FeedbackPanel q={q} feedback={feedback} />}
    </>
  );
}

export function WrittenTestInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onChange(text)}
      placeholder="Type your answer"
      aria-label="Your answer"
      autoComplete="off"
      spellCheck={false}
      className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
    />
  );
}

export function SelectedChoice({
  q,
  response,
  onAnswer,
}: {
  q: CardQuestion;
  response: string | undefined;
  onAnswer: (r: string) => void;
}) {
  const options =
    q.type === 'multiple_choice'
      ? q.choices.map((c) => ({ id: c.id, text: c.text }))
      : [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ];
  return (
    <div className="flex flex-col gap-3">
      {q.type === 'true_false' && (
        <div className="rounded-xl border bg-muted/40 p-4">
          <RichText text={q.shown} className="text-lg" />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onAnswer(o.id)}
            aria-pressed={response === o.id}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 text-left transition-colors hover:border-primary/50',
              response === o.id && 'border-primary bg-primary/8',
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground text-xs">
              {i + 1}
            </span>
            <RichText text={o.text} />
          </button>
        ))}
      </div>
    </div>
  );
}
