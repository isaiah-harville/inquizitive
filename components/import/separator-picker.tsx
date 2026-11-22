'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { escapeSeparator, unescapeSeparator } from '@/services/import-export/delimited';

/** A row of radio-like chips plus a "Custom" text box. */
export function SeparatorPicker({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: readonly { id: string; label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const preset = presets.find((p) => p.value === value);
  const [custom, setCustom] = useState(preset ? '' : escapeSeparator(value));
  const isCustom = !preset;
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-medium text-sm">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={value === p.value}
            onClick={() => onChange(p.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              value === p.value
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'hover:bg-muted',
            )}
          >
            {p.label}
          </button>
        ))}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-lg border pr-1 pl-3 text-sm',
            isCustom ? 'border-primary bg-primary/10 text-primary' : '',
          )}
        >
          Custom
          <Input
            value={isCustom ? escapeSeparator(value) : custom}
            onChange={(e) => {
              setCustom(e.target.value);
              if (e.target.value) onChange(unescapeSeparator(e.target.value));
            }}
            onFocus={() => custom && onChange(unescapeSeparator(custom))}
            placeholder="e.g. = or \n"
            className="h-7 w-24 bg-background font-mono text-xs"
            aria-label={`${label}: custom separator`}
          />
        </div>
      </div>
    </fieldset>
  );
}
