import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { serverConfig } from './config';

export const MEDIA_NAME = /^[0-9a-f-]{1,64}\.(png|jpe?g|gif|webp|avif)$/i;

export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
};

export interface BlobStore {
  put(name: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(name: string): Promise<Uint8Array | null>;
  exists(name: string): Promise<boolean>;
  delete(name: string): Promise<void>;
}

function assertName(name: string) {
  if (!MEDIA_NAME.test(name)) throw new Error(`invalid media name: ${name}`);
}

export function createFsStore(dir: string): BlobStore {
  const root = resolve(dir);
  return {
    async put(name, bytes) {
      assertName(name);
      await mkdir(root, { recursive: true });
      const tmp = join(root, `${name}.partial`);
      await writeFile(tmp, bytes);
      await rename(tmp, join(root, name));
    },
    async get(name) {
      assertName(name);
      try {
        return new Uint8Array(await readFile(join(root, name)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    async exists(name) {
      assertName(name);
      return stat(join(root, name)).then(
        () => true,
        () => false,
      );
    },
    async delete(name) {
      assertName(name);
      await rm(join(root, name), { force: true });
    },
  };
}

export async function createS3Store(opts: {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  prefix: string;
}): Promise<BlobStore> {
  const { AwsClient } = await import('aws4fetch');
  const client = new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    region: opts.region,
    service: 's3',
  });
  const base = new URL(opts.endpoint);
  const bucketUrl = opts.forcePathStyle
    ? `${base.origin}/${opts.bucket}`
    : `${base.protocol}//${opts.bucket}.${base.host}`;
  // Create the bucket on first start if it doesn't exist (best effort; managed S3 may forbid it).
  try {
    const head = await client.fetch(bucketUrl, { method: 'HEAD' });
    if (head.status === 404) {
      const created = await client.fetch(bucketUrl, { method: 'PUT' });
      if (!created.ok)
        console.warn(`[inquizitive] could not create bucket ${opts.bucket}: ${created.status}`);
    }
  } catch (e) {
    console.warn('[inquizitive] S3 bucket check failed:', e instanceof Error ? e.message : e);
  }
  const url = (name: string) => {
    const key = `${opts.prefix}${name}`;
    if (opts.forcePathStyle) return `${base.origin}/${opts.bucket}/${encodeURIComponent(key)}`;
    return `${base.protocol}//${opts.bucket}.${base.host}/${encodeURIComponent(key)}`;
  };
  return {
    async put(name, bytes, contentType) {
      assertName(name);
      const res = await client.fetch(url(name), {
        method: 'PUT',
        body: bytes as unknown as BodyInit,
        headers: { 'content-type': contentType },
      });
      if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${await res.text()}`);
    },
    async get(name) {
      assertName(name);
      const res = await client.fetch(url(name));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`S3 read failed: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async exists(name) {
      assertName(name);
      const res = await client.fetch(url(name), { method: 'HEAD' });
      return res.ok;
    },
    async delete(name) {
      assertName(name);
      const res = await client.fetch(url(name), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`S3 delete failed: ${res.status}`);
    },
  };
}

const globalKey = Symbol.for('inquizitive.blobStore');
type G = typeof globalThis & { [globalKey]?: Promise<BlobStore> };

export function blobStore(): Promise<BlobStore> {
  const g = globalThis as G;
  g[globalKey] ??= (async () => {
    const c = serverConfig();
    if (c.STORAGE_DRIVER === 's3') {
      return createS3Store({
        endpoint: c.S3_ENDPOINT as string,
        region: c.S3_REGION,
        bucket: c.S3_BUCKET as string,
        accessKeyId: c.S3_ACCESS_KEY_ID as string,
        secretAccessKey: c.S3_SECRET_ACCESS_KEY as string,
        forcePathStyle: c.S3_FORCE_PATH_STYLE,
        prefix: c.S3_PREFIX,
      });
    }
    return createFsStore(c.STORAGE_DIR);
  })();
  return g[globalKey];
}

/** Sniff the real image type from magic bytes (never trust the client's content-type). */
export function sniffImageType(bytes: Uint8Array): keyof typeof MIME_BY_EXT | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && ascii(8, 12).startsWith('avi')) return 'avif';
  return null;
}
