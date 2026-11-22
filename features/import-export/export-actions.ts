'use client';

import { toast } from 'sonner';
import type { Id } from '@/domain/models';
import { getApi } from '@/services/api/client';
import type { SetDetail } from '@/services/api/core';
import { ARCHIVE_EXTENSION, buildArchive } from '@/services/import-export/archive';
import { cardsToDelimited, safeFileName } from '@/services/import-export/export-text';
import { readMediaBytes, saveFile } from '@/services/platform';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportSetText(detail: SetDetail, format: 'csv' | 'tsv') {
  const text = cardsToDelimited(detail.cards, format === 'csv' ? ',' : '\t');
  const result = await saveFile(
    `${safeFileName(detail.set.title)}.${format}`,
    text,
    format === 'csv' ? 'text/csv' : 'text/tab-separated-values',
  );
  if (result === 'saved') toast.success(`Exported ${format.toUpperCase()}`);
}

/** Export sets (or the whole library when `setIds` is omitted) as a portable archive with media. */
export async function exportArchive(opts: {
  setIds?: Id[];
  includeProgress?: boolean;
  name: string;
}) {
  const api = await getApi();
  const bundle = await api.exportLibrary({
    setIds: opts.setIds,
    includeProgress: opts.includeProgress,
  });
  const { bytes, missingMedia } = await buildArchive(bundle, readMediaBytes);
  const result = await saveFile(
    `${safeFileName(opts.name)}-${today()}.${ARCHIVE_EXTENSION}`,
    bytes,
    'application/zip',
  );
  if (result === 'cancelled') return;
  toast.success(`Exported ${bundle.sets.length === 1 ? '1 set' : `${bundle.sets.length} sets`}`, {
    description: missingMedia.length
      ? `${missingMedia.length} image(s) could not be found and were skipped.`
      : undefined,
  });
}
