'use client';

import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardPaste,
  FileUp,
  Loader2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useDeferredValue, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ISSUE_LABEL, ROLE_LABEL } from '@/components/import/labels';
import { SeparatorPicker } from '@/components/import/separator-picker';
import { Page } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { LibraryImport } from '@/features/import-export/library-import';
import { useApiQuery } from '@/hooks/use-api';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getApi } from '@/services/api/client';
import {
  CARD_SEPARATOR_PRESETS,
  type ColumnRole,
  DEFAULT_IMPORT_OPTIONS,
  detectOptions,
  type ImportOptions,
  parseImport,
  selectRows,
  TERM_SEPARATOR_PRESETS,
} from '@/services/import-export/delimited';

const PREVIEW_LIMIT = 300;
const CHUNK = 1000;

const EXAMPLE = `photosynthesis\tHow plants turn light, water and CO₂ into glucose
mitochondria\tThe organelle that produces most of the cell's ATP
osmosis\tDiffusion of water across a semi-permeable membrane`;

function ImportView() {
  const params = useSearchParams();
  const router = useRouter();
  const targetSetId = params.get('set');
  const [source, setSource] = useState<'paste' | 'file' | 'library'>('paste');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [opts, setOpts] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const [touched, setTouched] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [skipIncomplete, setSkipIncomplete] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [dest, setDest] = useState<string>(targetSetId ?? 'new');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: mySets } = useApiQuery(['sets', { scope: 'mine', sort: 'title' }], (api) =>
    api.listSets({ scope: 'mine', sort: 'title' }),
  );
  const { data: target } = useApiQuery(['set', dest], (api) => api.getSet(dest), {
    enabled: dest !== 'new',
  });

  const deferredText = useDeferredValue(text);
  const result = useMemo(
    () => parseImport(deferredText, opts, target?.cards ?? []),
    [deferredText, opts, target?.cards],
  );
  const chosen = useMemo(
    () => selectRows(result, { skipDuplicates, skipIncomplete }),
    [result, skipDuplicates, skipIncomplete],
  );
  const chosenRows = useMemo(() => new Set(chosen.map((r) => r.row)), [chosen]);
  const counts = useMemo(() => {
    const c = { duplicates: 0, incomplete: 0, tooLong: 0 };
    for (const r of result.rows) {
      if (r.issues.includes('duplicate') || r.issues.includes('duplicate_existing')) c.duplicates++;
      if (r.issues.includes('missing_front') || r.issues.includes('missing_back')) c.incomplete++;
      if (r.issues.includes('too_long')) c.tooLong++;
    }
    return c;
  }, [result]);

  const update = (patch: Partial<ImportOptions>) => {
    setTouched(true);
    setOpts((o) => ({ ...o, ...patch }));
  };

  const loadText = (value: string, name?: string) => {
    setText(value);
    if (!touched || name) setOpts(detectOptions(value, name));
    if (name) {
      setFileName(name);
      setTouched(false);
      if (!newTitle) setNewTitle(name.replace(/\.(csv|tsv|txt)$/i, ''));
    }
  };

  const onFile = async (file: File) => {
    if (/\.(zip|json)$/i.test(file.name)) {
      setSource('library');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('That file is larger than 20 MB');
      return;
    }
    loadText(await file.text(), file.name);
    setSource('file');
  };

  const wide = result.columnCount > 2 || opts.quoted;
  const columnCount = Math.max(2, Math.min(result.columnCount, 12));

  const doImport = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const api = await getApi();
      let setId = dest;
      if (dest === 'new') setId = await api.createSet({ title: newTitle.trim() || 'Imported set' });
      const drafts = chosen.map((r) => r.card);
      for (let i = 0; i < drafts.length; i += CHUNK)
        await api.insertCards(setId, drafts.slice(i, i + CHUNK));
      toast.success(`Imported ${plural(drafts.length, 'card')}`);
      router.push(`/set/?id=${setId}`);
    } catch (e) {
      toast.error('Import failed — nothing was lost', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Import cards"
      description="Paste from notes, a spreadsheet or another flashcard app — you choose how terms and cards are separated."
    >
      <Tabs value={source} onValueChange={(v) => setSource(v as typeof source)} className="mb-6">
        <TabsList>
          <TabsTrigger value="paste">
            <ClipboardPaste /> Paste text
          </TabsTrigger>
          <TabsTrigger value="file">
            <FileUp /> CSV / TSV / TXT file
          </TabsTrigger>
          <TabsTrigger value="library">
            <Upload /> Inquizitive archive
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {source === 'library' ? (
        <LibraryImport />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-6">
            {source === 'paste' ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="import-text">Your data</Label>
                  {!text && (
                    <button
                      type="button"
                      className="text-primary text-xs hover:underline"
                      onClick={() => loadText(EXAMPLE)}
                    >
                      Try an example
                    </button>
                  )}
                </div>
                <Textarea
                  id="import-text"
                  value={text}
                  onChange={(e) => loadText(e.target.value)}
                  placeholder={'Word 1\tDefinition 1\nWord 2\tDefinition 2\nWord 3\tDefinition 3'}
                  className="min-h-64 font-mono text-sm"
                  spellCheck={false}
                />
                <p className="text-muted-foreground text-xs">
                  Copy and paste from Word, Excel, Google Docs, etc. Up to thousands of cards at
                  once.
                </p>
              </div>
            ) : (
              // biome-ignore lint/a11y/noStaticElementInteractions: drop zone with a real button inside
              <div
                className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary/50"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void onFile(f);
                }}
              >
                <FileUp className="size-8 text-muted-foreground" />
                <div className="font-medium">{fileName ?? 'Drop a file here'}</div>
                <p className="text-muted-foreground text-sm">
                  CSV, TSV or plain text. Anki and Quizlet text exports work too.
                </p>
                <Button variant="outline" onClick={() => fileInput.current?.click()}>
                  Choose file
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.tsv,.txt,.tab,text/csv,text/plain,text/tab-separated-values,.zip,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
            )}

            <div className="grid gap-5 card-raised p-5">
              <SeparatorPicker
                label="Between term and definition"
                presets={TERM_SEPARATOR_PRESETS}
                value={opts.termSeparator}
                onChange={(v) => update({ termSeparator: v })}
              />
              <SeparatorPicker
                label="Between cards"
                presets={CARD_SEPARATOR_PRESETS}
                value={opts.cardSeparator}
                onChange={(v) => update({ cardSeparator: v })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    Values in "quotes"
                    <span className="block text-muted-foreground text-xs">
                      CSV rules: quotes may contain separators & new lines
                    </span>
                  </span>
                  <Switch checked={opts.quoted} onCheckedChange={(v) => update({ quoted: v })} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    First row is a header
                    <span className="block text-muted-foreground text-xs">Skip column titles</span>
                  </span>
                  <Switch
                    checked={opts.hasHeader}
                    onCheckedChange={(v) => update({ hasHeader: v })}
                  />
                </label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => update({ swap: !opts.swap })}
              >
                <ArrowLeftRight />{' '}
                {opts.swap ? 'Swapped: definitions are terms' : 'Swap terms and definitions'}
              </Button>

              {wide && result.rows.length > 0 && (
                <div className="grid gap-2">
                  <div className="font-medium text-sm">Columns</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: columnCount }, (_, col) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                      <div key={col} className="flex items-center gap-2 rounded-lg border p-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-muted-foreground text-xs">Column {col + 1}</div>
                          <div className="truncate font-mono text-xs">
                            {result.sample[0]?.[col] ?? '—'}
                          </div>
                        </div>
                        <Select
                          value={opts.columns[col] ?? 'ignore'}
                          onValueChange={(v) => {
                            const columns = [...opts.columns];
                            while (columns.length <= col) columns.push('ignore');
                            columns[col] = v as ColumnRole;
                            update({ columns });
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-36"
                            aria-label={`Column ${col + 1} is`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ROLE_LABEL) as ColumnRole[]).map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  {opts.columns.includes('accepted') && (
                    <p className="text-muted-foreground text-xs">
                      Separate alternative answers inside a cell with{' '}
                      <code className="rounded bg-muted px-1">{opts.acceptedSeparator}</code>.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Preview</h2>
              <Badge variant="secondary">{plural(chosen.length, 'card')} to import</Badge>
              {counts.duplicates > 0 && (
                <Badge variant="outline">{plural(counts.duplicates, 'duplicate')}</Badge>
              )}
              {counts.incomplete > 0 && (
                <Badge variant="outline">{counts.incomplete} incomplete</Badge>
              )}
            </div>
            {result.errors.map((e) => (
              <div
                key={e}
                className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {e}
              </div>
            ))}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={skipDuplicates}
                  onCheckedChange={(v) => setSkipDuplicates(!!v)}
                />{' '}
                Skip duplicates
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={skipIncomplete}
                  onCheckedChange={(v) => setSkipIncomplete(!!v)}
                />{' '}
                Skip cards missing a side
              </label>
            </div>

            <div className="max-h-[32rem] overflow-auto card-raised">
              {result.rows.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">
                  {text
                    ? 'Nothing to import with these settings — try another separator.'
                    : 'Your cards will appear here as you paste.'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-muted-foreground text-xs">
                    <tr className="border-b">
                      <th className="w-10 px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Term</th>
                      <th className="px-3 py-2 font-medium">Definition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, PREVIEW_LIMIT).map((r) => {
                      const included = chosenRows.has(r.row);
                      return (
                        <tr
                          key={r.row}
                          className={cn(
                            'border-b align-top last:border-0',
                            !included && 'opacity-45',
                          )}
                        >
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.row}</td>
                          <td className="max-w-0 px-3 py-2">
                            <div className="whitespace-pre-wrap break-words">
                              {r.card.front || <em className="text-muted-foreground">empty</em>}
                            </div>
                            {r.issues.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {r.issues.map((i) => (
                                  <Badge
                                    key={i}
                                    variant="outline"
                                    className="text-[0.65rem] text-warning-foreground"
                                  >
                                    {ISSUE_LABEL[i]}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="max-w-0 px-3 py-2">
                            <div className="whitespace-pre-wrap break-words">
                              {r.card.back || <em className="text-muted-foreground">empty</em>}
                            </div>
                            {!!r.card.explanation && (
                              <div className="mt-1 text-muted-foreground text-xs">
                                {r.card.explanation}
                              </div>
                            )}
                            {!!r.card.acceptedAnswers?.length && (
                              <div className="mt-1 text-muted-foreground text-xs">
                                also: {r.card.acceptedAnswers.join(', ')}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {result.rows.length > PREVIEW_LIMIT && (
                <div className="border-t p-3 text-center text-muted-foreground text-xs">
                  Showing the first {PREVIEW_LIMIT} of {result.rows.length.toLocaleString()} rows
                </div>
              )}
            </div>

            <div className="grid gap-3 card-raised p-5">
              <Label>Add to</Label>
              <Select value={dest} onValueChange={setDest}>
                <SelectTrigger aria-label="Destination set">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">A new study set</SelectItem>
                  {mySets?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dest === 'new' && (
                <Input
                  placeholder="New set title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  aria-label="New set title"
                />
              )}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" asChild>
                  <Link href={dest !== 'new' ? `/set/?id=${dest}` : '/library/'}>Cancel</Link>
                </Button>
                <Button disabled={busy || chosen.length === 0} onClick={doImport}>
                  {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                  Import {plural(chosen.length, 'card')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={null}>
      <ImportView />
    </Suspense>
  );
}
