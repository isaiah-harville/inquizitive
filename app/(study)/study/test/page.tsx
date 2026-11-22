'use client';

import { Check, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { StudyHeader, StudyMessage } from '@/components/study/study-header';
import { CardQuestionBlock, MatchingInput } from '@/components/study/test-questions';
import { Setup } from '@/components/study/test-setup';
import { Button } from '@/components/ui/button';
import type { Id } from '@/domain/models';
import { newSeed } from '@/domain/random';
import type { Question } from '@/domain/study/questions';
import {
  buildTest,
  gradeQuestion,
  gradeTest,
  type TestConfig,
  type TestResponse,
} from '@/domain/study/test';
import { useStudySession, useStudySet } from '@/hooks/use-study';
import { cn } from '@/lib/utils';
import type { AttemptDraft } from '@/services/repositories/sessions';

interface TestState {
  version: 1;
  config: TestConfig;
  seed: number;
  questions: Question[];
  responses: Record<string, TestResponse>;
  submitted: boolean;
}

function TestView() {
  const setId = useSearchParams().get('set') ?? '';
  const { data, cards, full, isLoading } = useStudySet(setId);
  const session = useStudySession<TestState>(setId, 'test', 1);
  const [configuring, setConfiguring] = useState(false);
  const starred = useMemo(
    () => cards.filter((c) => data?.progress[c.id]?.starred).map((c) => c.id),
    [cards, data],
  );

  const state = session.state;
  const summary = useMemo(
    () => (state?.submitted ? gradeTest(state.questions, state.responses) : null),
    [state],
  );

  const start = (config: TestConfig) => {
    const resolved = {
      ...config,
      cardIds: config.cardIds?.[0] === '__starred__' ? starred : config.cardIds,
    };
    const seed = newSeed();
    setConfiguring(false);
    void session.start({
      version: 1,
      config: resolved,
      seed,
      questions: buildTest(cards, resolved, seed),
      responses: {},
      submitted: false,
    });
  };

  const respond = (q: Question, response: TestResponse) => {
    if (!state || state.submitted) return;
    if (
      state.config.revealImmediately &&
      q.type !== 'matching' &&
      state.responses[q.id] !== undefined
    )
      return;
    void session.commit({ ...state, responses: { ...state.responses, [q.id]: response } });
  };

  const submit = () => {
    if (!state) return;
    const graded = gradeTest(state.questions, state.responses);
    const attempts = state.questions.flatMap((q, i): AttemptDraft[] => {
      const r = graded.results[i];
      if (q.type === 'matching') {
        return q.items.map((item) => ({
          flashcardId: item.cardId,
          questionType: 'matching' as const,
          response:
            (state.responses[q.id] as Record<string, string> | undefined)?.[item.cardId] ?? null,
          correct: !!r.itemResults?.[item.cardId],
        }));
      }
      const resp = state.responses[q.id];
      return [
        {
          flashcardId: q.cardId,
          questionType: q.type,
          response: typeof resp === 'string' ? resp : null,
          correct: r.correct,
        },
      ];
    });
    void session.commit({ ...state, submitted: true }, { attempts, completed: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!setId) return <StudyMessage title="No set selected" />;
  if (isLoading || !session.ready) return <StudyMessage title="Loading…" />;
  if (cards.length === 0) {
    return (
      <StudyMessage title="This set has no cards yet">
        <Button asChild>
          <Link href={`/set/edit/?id=${setId}`}>Add cards</Link>
        </Button>
      </StudyMessage>
    );
  }

  const title = data?.set.title ?? '';
  if (!state || configuring) {
    return (
      <>
        <StudyHeader setId={setId} title={title} mode="Test" />
        <Setup maxCards={cards.length} starredCount={starred.length} onStart={start} />
      </>
    );
  }

  const answered = state.questions.filter(
    (q) => state.responses[q.id] !== undefined && state.responses[q.id] !== '',
  ).length;
  const total = state.questions.length;

  return (
    <>
      <StudyHeader
        setId={setId}
        title={title}
        mode="Test"
        progress={state.submitted ? 1 : answered / Math.max(1, total)}
        progressLabel={state.submitted ? undefined : `${answered} / ${total} answered`}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        {summary && (
          <div className="flex flex-wrap items-center gap-6 card-raised rounded-3xl p-6">
            <div
              className="relative flex size-28 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--primary) ${summary.percent * 3.6}deg, var(--muted) 0)`,
              }}
            >
              <div className="flex size-22 flex-col items-center justify-center rounded-full bg-card">
                <span className="font-semibold text-2xl tabular-nums">{summary.percent}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-xl">
                {summary.percent >= 90
                  ? 'Outstanding!'
                  : summary.percent >= 70
                    ? 'Nice work!'
                    : summary.percent >= 50
                      ? 'Getting there'
                      : 'Keep practicing'}
              </h1>
              <p className="text-muted-foreground">
                {Math.round(summary.score * 10) / 10} of {summary.maxScore} correct ·{' '}
                {summary.missedCardIds.length} card(s) to review
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.missedCardIds.length > 0 && (
                  <Button
                    onClick={() =>
                      start({
                        ...state.config,
                        cardIds: summary.missedCardIds,
                        questionCount: summary.missedCardIds.length,
                      })
                    }
                  >
                    <RotateCcw /> Retry missed questions
                  </Button>
                )}
                <Button variant="outline" onClick={() => setConfiguring(true)}>
                  New test
                </Button>
              </div>
            </div>
          </div>
        )}

        {state.questions.map((q, i) => {
          const response = state.responses[q.id];
          const result =
            state.submitted ||
            (state.config.revealImmediately && response !== undefined && q.type !== 'matching')
              ? gradeQuestion(q, response)
              : null;
          return (
            <section
              key={q.id}
              className="flex flex-col gap-5 card-raised rounded-3xl p-6"
              aria-label={`Question ${i + 1}`}
            >
              <div className="flex items-center justify-between text-muted-foreground text-sm">
                <span>
                  {i + 1} of {total}
                </span>
                {result && state.submitted && (
                  <span
                    className={cn(
                      'flex items-center gap-1 font-medium',
                      result.correct ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {result.correct ? <Check className="size-4" /> : <X className="size-4" />}
                    {q.type === 'matching'
                      ? `${Math.round(result.score * q.items.length)} / ${q.items.length}`
                      : result.correct
                        ? 'Correct'
                        : 'Incorrect'}
                  </span>
                )}
              </div>
              {q.type === 'matching' ? (
                <>
                  <div className="text-muted-foreground text-sm">
                    Match each item with its answer
                  </div>
                  <MatchingInput
                    q={q}
                    value={(response as Record<Id, Id>) ?? {}}
                    onChange={(v) => respond(q, v)}
                    locked={state.submitted}
                    results={result?.itemResults}
                  />
                </>
              ) : (
                <CardQuestionBlock
                  q={q}
                  card={full.get(q.cardId)}
                  response={response as string | undefined}
                  showResult={!!result}
                  onAnswer={(r) => respond(q, r)}
                />
              )}
            </section>
          );
        })}

        {!state.submitted && (
          <div className="flex flex-col items-center gap-2 py-4">
            <Button size="lg" onClick={submit} className="min-w-48">
              Submit test
            </Button>
            {answered < total && (
              <span className="text-muted-foreground text-sm">
                {total - answered} question(s) unanswered
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function TestPage() {
  return (
    <Suspense fallback={null}>
      <TestView />
    </Suspense>
  );
}
