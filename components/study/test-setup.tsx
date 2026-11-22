'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { QuestionType } from '@/domain/models';
import { DEFAULT_TEST_CONFIG, type TestConfig } from '@/domain/study/test';
import { cn } from '@/lib/utils';

export const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / false' },
  { value: 'written', label: 'Written' },
  { value: 'matching', label: 'Matching' },
];

export function Setup({
  maxCards,
  starredCount,
  onStart,
}: {
  maxCards: number;
  starredCount: number;
  onStart: (c: TestConfig) => void;
}) {
  const [config, setConfig] = useState<TestConfig>({
    ...DEFAULT_TEST_CONFIG,
    questionCount: Math.min(20, maxCards),
  });
  const [starredOnly, setStarredOnly] = useState(false);
  const pool = starredOnly ? starredCount : maxCards;
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6 px-4 py-10">
      <div>
        <h1 className="font-semibold text-2xl">Set up your practice test</h1>
        <p className="mt-1 text-muted-foreground">
          Everything is generated on this device from your cards.
        </p>
      </div>
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label>Questions</Label>
          <span className="font-medium tabular-nums">{Math.min(config.questionCount, pool)}</span>
        </div>
        <Slider
          min={1}
          max={Math.max(1, pool)}
          step={1}
          value={[Math.min(config.questionCount, pool)]}
          onValueChange={([v]) => setConfig((c) => ({ ...c, questionCount: v }))}
          aria-label="Number of questions"
        />
      </div>
      <div className="grid gap-2">
        <Label>Question types</Label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className="flex items-center gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
            >
              <Checkbox
                checked={config.types.includes(t.value)}
                onCheckedChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    types: v ? [...c.types, t.value] : c.types.filter((x) => x !== t.value),
                  }))
                }
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Answer with</Label>
        <Select
          value={config.direction}
          onValueChange={(v) =>
            setConfig((c) => ({ ...c, direction: v as TestConfig['direction'] }))
          }
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
      <div className="grid gap-3 rounded-xl border p-4">
        <label className="flex items-center justify-between text-sm">
          Shuffle questions{' '}
          <Switch
            checked={config.randomize}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, randomize: v }))}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          Show answers immediately
          <Switch
            checked={config.revealImmediately}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, revealImmediately: v }))}
          />
        </label>
        <label
          className={cn(
            'flex items-center justify-between text-sm',
            starredCount === 0 && 'opacity-50',
          )}
        >
          Starred cards only ({starredCount})
          <Switch
            disabled={starredCount === 0}
            checked={starredOnly}
            onCheckedChange={setStarredOnly}
          />
        </label>
      </div>
      <Button
        size="lg"
        disabled={config.types.length === 0 || pool === 0}
        onClick={() =>
          onStart({
            ...config,
            questionCount: Math.min(config.questionCount, pool),
            cardIds: starredOnly ? ['__starred__'] : undefined,
          })
        }
      >
        Start test
      </Button>
    </div>
  );
}
