import { unzipSync, zipSync } from 'fflate';
import { BUNDLE_FORMAT, bundleMediaPaths, type LibraryBundle, parseBundle } from './bundle';

export const ARCHIVE_EXTENSION = 'inquizitive.zip';
const MAX_ARCHIVE_ENTRIES = 50_000;
const MEDIA_RE = /^media\/([0-9a-fA-F-]{1,64}\.(png|jpe?g|gif|webp|avif))$/i;

export async function buildArchive(
  bundle: LibraryBundle,
  readMedia: (name: string) => Promise<Uint8Array | null>,
): Promise<{ bytes: Uint8Array; missingMedia: string[] }> {
  const files: Record<string, Uint8Array> = {
    'library.json': new TextEncoder().encode(JSON.stringify(bundle, null, 2)),
    'README.txt': new TextEncoder().encode(
      `This is an Inquizitive library archive (${BUNDLE_FORMAT} v${bundle.version}).\n` +
        'library.json holds sets and cards; media/ holds card images.\n' +
        'Import it from Settings → Data in Inquizitive.\n',
    ),
  };
  const missingMedia: string[] = [];
  for (const name of bundleMediaPaths(bundle)) {
    const bytes = await readMedia(name);
    if (bytes) files[`media/${name}`] = bytes;
    else missingMedia.push(name);
  }
  return { bytes: zipSync(files, { level: 6, mem: 8 }), missingMedia };
}

export interface ParsedArchive {
  bundle: LibraryBundle;
  media: Map<string, Uint8Array>;
}

/** Read an archive (ZIP) or a bare library.json. Validates everything; rejects unexpected paths. */
export function readArchive(bytes: Uint8Array): ParsedArchive {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error(
        'This file is neither an Inquizitive archive (.zip) nor a library .json file.',
      );
    }
    return { bundle: parseBundle(json), media: new Map() };
  }
  let entries: Record<string, Uint8Array>;
  try {
    let count = 0;
    entries = unzipSync(bytes, {
      filter: (f) => {
        count++;
        if (count > MAX_ARCHIVE_ENTRIES) throw new Error('Archive has too many files.');
        return f.name === 'library.json' || MEDIA_RE.test(f.name);
      },
    });
  } catch (e) {
    throw new Error(`Could not open the archive: ${e instanceof Error ? e.message : String(e)}`);
  }
  const json = entries['library.json'];
  if (!json) throw new Error('The archive has no library.json — is it an Inquizitive export?');
  const bundle = parseBundle(JSON.parse(new TextDecoder().decode(json)));
  const media = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    const m = MEDIA_RE.exec(path);
    if (m) media.set(m[1], data);
  }
  return { bundle, media };
}
