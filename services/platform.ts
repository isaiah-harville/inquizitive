import { backend } from '@/services/api/client';
import { idbDelete, idbGet, idbSet } from '@/services/db/idb';

export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** Store image bytes under `name` (desktop/browser). */
export async function writeLocalMedia(name: string, bytes: Uint8Array): Promise<void> {
  if (backend() === 'desktop') await tauriInvoke('media_write', { name, bytes: Array.from(bytes) });
  else await idbSet('media', name, bytes);
}

export async function readMediaBytes(name: string): Promise<Uint8Array | null> {
  switch (backend()) {
    case 'desktop':
      try {
        return new Uint8Array(await tauriInvoke<ArrayBuffer>('media_read', { name }));
      } catch {
        return null;
      }
    case 'browser':
      return (await idbGet<Uint8Array>('media', name)) ?? null;
    case 'server': {
      const res = await fetch(`/api/media?name=${encodeURIComponent(name)}`, {
        credentials: 'same-origin',
      });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    }
  }
}

export async function deleteLocalMedia(name: string): Promise<void> {
  if (backend() === 'desktop') await tauriInvoke('media_remove', { name });
  else if (backend() === 'browser') await idbDelete('media', name);
}

/** Upload/store an image file; returns its generated name and type. */
export async function storeImage(file: Blob): Promise<{ path: string; mimeType: string }> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error('Only PNG, JPEG, GIF, WebP and AVIF images are supported.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images must be 10 MB or smaller.');
  if (backend() === 'server') {
    const res = await fetch('/api/media', {
      method: 'POST',
      body: file,
      credentials: 'same-origin',
    });
    const body = (await res.json()) as { path?: string; mimeType?: string; error?: string };
    if (!res.ok || !body.path) throw new Error(body.error ?? 'Upload failed');
    return { path: body.path, mimeType: body.mimeType ?? file.type };
  }
  const path = `${crypto.randomUUID()}.${ext}`;
  await writeLocalMedia(path, new Uint8Array(await file.arrayBuffer()));
  return { path, mimeType: file.type };
}

const urlCache = new Map<string, Promise<string | null>>();

/** A URL an <img> can display for a stored image. */
export function mediaUrl(name: string): Promise<string | null> {
  if (backend() === 'server') return Promise.resolve(`/api/media?name=${encodeURIComponent(name)}`);
  let p = urlCache.get(name);
  if (!p) {
    p = readMediaBytes(name).then((bytes) => {
      if (!bytes) return null;
      const ext = name.split('.').pop()?.toLowerCase();
      const type = Object.entries(IMAGE_TYPES).find(
        ([, e]) => e === ext || (ext === 'jpeg' && e === 'jpg'),
      )?.[0];
      return URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: type ?? 'application/octet-stream' }),
      );
    });
    urlCache.set(name, p);
  }
  return p;
}

/** Save a file the user asked to export. Desktop: native save dialog. Web: browser download. */
export async function saveFile(
  fileName: string,
  data: Uint8Array | string,
  mime: string,
): Promise<'saved' | 'cancelled'> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (backend() === 'desktop') {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const ext = fileName.split('.').pop() ?? '';
    const path = await save({
      defaultPath: fileName,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [],
    });
    if (!path) return 'cancelled';
    await writeFile(path, bytes);
    return 'saved';
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

/** Restore an image from an archive under its original name (never overwrites). */
export async function restoreMedia(name: string, bytes: Uint8Array): Promise<void> {
  if (backend() === 'server') {
    const res = await fetch(`/api/media?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: bytes as BodyInit,
      credentials: 'same-origin',
    });
    if (!res.ok)
      throw new Error(
        ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Upload failed',
      );
    return;
  }
  if ((await readMediaBytes(name)) === null) await writeLocalMedia(name, bytes);
}
