'use client';

import { Archive, Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAction } from '@/hooks/use-api';
import { plural } from '@/lib/format';
import { type ParsedArchive, readArchive } from '@/services/import-export/archive';
import { restoreMedia } from '@/services/platform';

/**
 * Import an Inquizitive archive (.zip) or library .json: a shared set, an
 * export from another device, or a full backup. Existing data is never
 * overwritten — anything already in the library is added as a copy.
 */
export function LibraryImport({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(ParsedArchive & { fileName: string }) | null>(null);
  const [includeProgress, setIncludeProgress] = useState(true);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    try {
      setParsed({ ...readArchive(new Uint8Array(await file.arrayBuffer())), fileName: file.name });
    } catch (e) {
      toast.error("Can't import this file", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      let failed = 0;
      for (const [name, bytes] of parsed.media) {
        try {
          await restoreMedia(name, bytes);
        } catch {
          failed++;
        }
      }
      const report = await action((api) => api.importLibrary(parsed.bundle, { includeProgress }));
      toast.success(
        `Imported ${plural(report.setsImported, 'set')} with ${plural(report.cardsImported, 'card')}`,
        {
          description: [
            report.setsCopied
              ? `${plural(report.setsCopied, 'set')} already existed and were added as copies.`
              : '',
            failed ? `${plural(failed, 'image')} could not be restored.` : '',
          ]
            .filter(Boolean)
            .join(' '),
        },
      );
      setParsed(null);
      onDone?.();
      router.push('/library/');
    } finally {
      setBusy(false);
    }
  };

  const cards = parsed?.bundle.sets.reduce((n, s) => n + s.cards.length, 0) ?? 0;
  const hasProgress = !!parsed?.bundle.progress?.length || !!parsed?.bundle.reviews?.length;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <input
        ref={input}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
      {!parsed ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: drop zone with a real button inside
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void pick(f);
          }}
        >
          <Archive className="size-8 text-muted-foreground" />
          <div className="font-medium">Import an Inquizitive archive or backup</div>
          <p className="text-muted-foreground text-sm">
            A .zip or .json exported from Inquizitive. Nothing in your library is overwritten.
          </p>
          <Button variant="outline" onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 card-raised p-5">
          <div>
            <div className="font-medium">{parsed.fileName}</div>
            <div className="text-muted-foreground text-sm">
              {plural(parsed.bundle.sets.length, 'set')} · {plural(cards, 'card')} ·{' '}
              {plural(parsed.media.size, 'image')} · exported{' '}
              {new Date(parsed.bundle.exportedAt).toLocaleDateString()}
            </div>
          </div>
          <ul className="max-h-48 overflow-auto text-sm">
            {parsed.bundle.sets.slice(0, 50).map((s) => (
              <li key={s.id} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                <span className="truncate">{s.title}</span>
                <span className="shrink-0 text-muted-foreground">{s.cards.length}</span>
              </li>
            ))}
          </ul>
          {hasProgress && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeProgress}
                onCheckedChange={(v) => setIncludeProgress(!!v)}
              />
              Restore study progress and review history
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setParsed(null)}>
              Cancel
            </Button>
            <Button onClick={run} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Import
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
