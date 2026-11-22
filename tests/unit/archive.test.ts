import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildArchive, readArchive } from '@/services/import-export/archive';
import { BUNDLE_FORMAT, BUNDLE_VERSION, type LibraryBundle } from '@/services/import-export/bundle';

const bundle: LibraryBundle = {
  format: BUNDLE_FORMAT,
  version: BUNDLE_VERSION,
  exportedAt: 1,
  folders: [],
  sets: [
    {
      id: 's1',
      folderId: null,
      title: 'T',
      description: '',
      tags: [],
      cards: [
        {
          id: 'c1',
          front: 'f',
          back: 'b',
          explanation: '',
          acceptedAnswers: [],
          media: [{ side: 'front', path: 'abc.png', mimeType: 'image/png' }],
        },
      ],
    },
  ],
};

describe('archives', () => {
  it('round-trips bundle and media, reporting missing files', async () => {
    const { bytes, missingMedia } = await buildArchive(bundle, async (n) =>
      n === 'abc.png' ? new Uint8Array([1, 2, 3]) : null,
    );
    expect(missingMedia).toEqual([]);
    const parsed = readArchive(bytes);
    expect(parsed.bundle.sets[0].title).toBe('T');
    expect([...(parsed.media.get('abc.png') ?? [])]).toEqual([1, 2, 3]);
    const missing = await buildArchive(bundle, async () => null);
    expect(missing.missingMedia).toEqual(['abc.png']);
  });

  it('accepts a bare JSON file', () => {
    expect(readArchive(new TextEncoder().encode(JSON.stringify(bundle))).bundle.sets).toHaveLength(
      1,
    );
  });

  it('ignores unexpected paths (no traversal) and rejects junk', () => {
    const zip = zipSync({
      'library.json': new TextEncoder().encode(JSON.stringify(bundle)),
      '../evil.png': new Uint8Array([1]),
      'media/../../x.png': new Uint8Array([1]),
      'media/0abc-12.png': new Uint8Array([9]),
      'media/not-hex.png': new Uint8Array([9]),
    });
    const parsed = readArchive(zip);
    expect([...parsed.media.keys()]).toEqual(['0abc-12.png']);
    expect(() => readArchive(new TextEncoder().encode('not json'))).toThrow(/neither/);
    expect(() => readArchive(zipSync({ 'x.txt': new Uint8Array([1]) }))).toThrow(/no library.json/);
  });
});
