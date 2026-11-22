'use client';

import { ArrowRight, Settings2, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AnswerControls,
  type Feedback,
  FeedbackPanel,
  QuestionPrompt,
  questionInstruction,
} from '@/components/study/question';
import { StudyHeader, StudyMessage } from '@/components/study/study-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { gradeWritten } from '@/domain/grading/grade';
import { newSeed } from '@/domain/random';
import {
  answerLearn,
  currentQuestion,
  DEFAULT_LEARN_SETTINGS,
  isRoundComplete,
  type LearnQuestionType,
  type LearnSettings,
  type LearnState,
  learnProgress,
  nextRound,
  startLearn,
} from '@/domain/study/learn';
import { type AnswerDirection, isChoiceCorrect } from '@/domain/study/questions';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { useHotkeys, useStudySession, useStudySet } from '@/hooks/use-study';
import { plural } from '@/lib/format';

const TYPE_OPTIONS: { value: LearnQuestionType; label: string; hint: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice', hint: 'Pick from four options' },
  { value: 'true_false', label: 'True / false', hint: 'Is this pairing right?' },
  { value: 'written', label: 'Written', hint: 'Type the answer from memory' },
  { value: 'flashcard', label: 'Flashcard recall', hint: 'Reveal, then rate yourself' },
];

function SettingsDialog({
  open,
  initial,
  onStart,
  onOpenChange,
}: {
  open: boolean;
  initial: LearnSettings;
  onStart: (s: LearnSettings) => void;
  onOpenChange?: (o: boolean) => void;
}) {
  const [s, setS] = useState(initial);
  useEffect(() => setS(initial), [initial]);
  const toggle = (t: LearnQuestionType, on: boolean) =>
    setS((x) => ({
      ...x,
      questionTypes: on ? [...x.questionTypes, t] : x.questionTypes.filter((y) => y !== t),
    }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Learn options</DialogTitle>
          <DialogDescription>
            Easier questions come first; harder ones once you know a card.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Question types</Label>
            {TYPE_OPTIONS.map((t) => (
              <label
                key={t.value}
                className="flex items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
              >
                <Checkbox
                  checked={s.questionTypes.includes(t.value)}
                  onCheckedChange={(v) => toggle(t.value, !!v)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-sm">{t.label}</span>
                  <span className="block text-muted-foreground text-xs">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Answer with</Label>
              <Select
                value={s.direction}
                onValueChange={(v) => setS((x) => ({ ...x, direction: v as AnswerDirection }))}
              >
                <SelectTrigger aria-label="Answer with">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="back">Definition</SelectItem>
                  <SelectItem value="front">Term</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cards per round</Label>
              <Select
                value={String(s.roundSize)}
                onValueChange={(v) => setS((x) => ({ ...x, roundSize: Number(v) }))}
              >
                <SelectTrigger aria-label="Cards per round">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 7, 10, 15, 20].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={s.questionTypes.length === 0} onClick={() => onStart(s)}>
            Start learning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LearnView() {
  const setId = useSearchParams().get('set') ?? '';
  const { data, cards, byId, full, isLoading } = useStudySet(setId);
  const session = useStudySession<LearnState>(setId, 'learn', 1);
  const action = useAction();
  const { data: settings } = useApiQuery(['settings'], (api) => api.getSettings());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const savedDefaults = useMemo<LearnSettings>(
    () => ({ ...DEFAULT_LEARN_SETTINGS, ...((settings?.learn as Partial<LearnSettings>) ?? {}) }),
    [settings],
  );

  const state = session.state;
  const question = useMemo(
    () => (state ? currentQuestion(state, byId, cards) : null),
    [state, byId, cards],
  );

  const begin = useCallback(
    async (s: LearnSettings) => {
      setOptionsOpen(false);
      setFeedback(null);
      await session.start(
        startLearn(
          cards.map((c) => c.id),
          s,
          newSeed(),
        ),
      );
      void action((api) => api.setSetting('learn', s), { refresh: false });
    },
    [session, cards, action],
  );

  useEffect(() => {
    if (state && question === null && state.queue.length > 0) {
      void session.commit({ ...state, queue: state.queue.filter((id) => byId.has(id)) });
    }
  }, [state, question, byId, session]);

  const respond = (response: string) => {
    if (!question || feedback) return;
    if (question.type === 'written') {
      const grade = gradeWritten(response, question.acceptedAnswers);
      setFeedback({ correct: grade.correct, response, grade });
    } else {
      setFeedback({ correct: isChoiceCorrect(question, response), response });
    }
  };

  const advance = useCallback(() => {
    if (!state || !question || !feedback) return;
    const next = answerLearn(state, feedback.correct);
    setFeedback(null);
    void session.commit(next, {
      attempts: [
        {
          flashcardId: question.cardId,
          questionType: question.type,
          response: feedback.response,
          correct: feedback.correct,
        },
      ],
    });
  }, [state, question, feedback, session]);

  useEffect(() => {
    const autoAdvance = (settings?.studyAutoAdvance as boolean | undefined) ?? true;
    if (autoAdvance && feedback?.correct && feedback.grade?.verdict !== 'almost') {
      const t = setTimeout(advance, 900);
      return () => clearTimeout(t);
    }
  }, [feedback, advance, settings]);

  useHotkeys((e) => {
    if (feedback && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
      e.preventDefault();
      advance();
    }
  });
  useEffect(() => {
    if (!feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName === 'INPUT') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, advance]);

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
  if (!state) {
    return (
      <>
        <StudyHeader setId={setId} title={data?.set.title ?? ''} mode="Learn" />
        <SettingsDialog open initial={savedDefaults} onStart={begin} />
      </>
    );
  }

  const progress = learnProgress(state);
  const header = (
    <StudyHeader
      setId={setId}
      title={data?.set.title ?? ''}
      mode="Learn"
      progress={progress.ratio}
      progressLabel={`${progress.mastered} / ${progress.total} mastered`}
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Learn options"
          onClick={() => setOptionsOpen(true)}
        >
          <Settings2 />
        </Button>
      }
    />
  );
  const options = (
    <SettingsDialog
      open={optionsOpen}
      onOpenChange={setOptionsOpen}
      initial={state.settings}
      onStart={begin}
    />
  );

  if (state.completed) {
    const firstTry = progress.total;
    return (
      <>
        {header}
        <StudyMessage title="You've mastered this set!">
          <Trophy className="size-12 text-star" />
          <p className="text-muted-foreground">
            {plural(firstTry, 'card')} learned in {plural(state.round, 'round')} and{' '}
            {plural(state.step, 'answer')}.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => begin(state.settings)}>Learn again</Button>
            <Button variant="outline" asChild>
              <Link href={`/study/test/?set=${setId}`}>Take a practice test</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/study/review/?set=${setId}`}>Schedule spaced review</Link>
            </Button>
          </div>
        </StudyMessage>
        {options}
      </>
    );
  }

  if (isRoundComplete(state)) {
    const results = Object.entries(state.roundResults);
    const right = results.filter(([, ok]) => ok).length;
    return (
      <>
        {header}
        <StudyMessage title={`Round ${state.round} done`}>
          <p className="text-muted-foreground">
            {right} of {results.length} right on the first try.
          </p>
          <div className="w-full max-w-sm space-y-2 text-left text-sm">
            <ProgressRow
              label="Mastered"
              value={progress.mastered}
              total={progress.total}
              className="bg-success"
            />
            <ProgressRow
              label="Familiar"
              value={progress.familiar}
              total={progress.total}
              className="bg-primary"
            />
            <ProgressRow
              label="Not yet"
              value={progress.fresh}
              total={progress.total}
              className="bg-muted-foreground/40"
            />
          </div>
          <Button size="lg" autoFocus onClick={() => void session.commit(nextRound(state))}>
            Continue <ArrowRight />
          </Button>
        </StudyMessage>
        {options}
      </>
    );
  }

  if (!question) return <StudyMessage title="Loading…" />;
  const card = full.get(question.cardId);

  return (
    <>
      {header}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-6 card-raised rounded-3xl p-6 shadow-sm sm:p-8"
        >
          <QuestionPrompt q={question} card={card} />
          <div className="text-muted-foreground text-sm">{questionInstruction(question)}</div>
          <AnswerControls q={question} feedback={feedback} onAnswer={respond} />
          {feedback && (
            <FeedbackPanel
              q={question}
              feedback={feedback}
              onOverride={() => setFeedback({ ...feedback, correct: true })}
            />
          )}
        </motion.div>
        {feedback && (
          <div className="flex justify-end">
            <Button size="lg" onClick={advance} autoFocus={question.type !== 'written'}>
              Continue{' '}
              <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">↵</Kbd>
            </Button>
          </div>
        )}
      </div>
      {options}
    </>
  );
}

function ProgressRow({
  label,
  value,
  total,
  className,
}: {
  label: string;
  value: number;
  total: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${className}`}
          style={{ width: `${total ? (value / total) * 100 : 0}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}

export default function LearnPage() {
  return (
    <Suspense fallback={null}>
      <LearnView />
    </Suspense>
  );
}
