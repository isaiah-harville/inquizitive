import { newId } from '@/lib/id';
import { serverConfig } from '@/server/config';
import { serverDb } from '@/server/db';
import { json, withUser } from '@/server/http';
import { blobStore, MEDIA_NAME, MIME_BY_EXT, sniffImageType } from '@/server/storage';
import { ApiError } from '@/services/api/core';

export const dynamic = 'force-dynamic';

/**
 * Upload an image; returns the generated file name to attach to a card.
 * Restoring a backup may pass `?name=` to keep the archive's file name; an
 * existing file with that name is never overwritten.
 */
export async function POST(req: Request) {
  return withUser(req, async () => {
    const requested = new URL(req.url).searchParams.get('name');
    const max = serverConfig().MAX_UPLOAD_MB * 1024 * 1024;
    if (Number(req.headers.get('content-length') ?? 0) > max)
      throw new ApiError('Image is too large', 400);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > max) throw new ApiError('Image is too large', 400);
    const ext = sniffImageType(bytes);
    if (!ext) throw new ApiError('Only PNG, JPEG, GIF, WebP and AVIF images are supported', 400);
    const store = await blobStore();
    let name = `${newId()}.${ext}`;
    if (requested) {
      const reqExt = requested.split('.').pop()?.toLowerCase();
      const sameType = reqExt === ext || (reqExt === 'jpeg' && ext === 'jpg');
      if (!MEDIA_NAME.test(requested) || !sameType) throw new ApiError('Invalid media name', 400);
      if (await store.exists(requested))
        return json({ path: requested, mimeType: MIME_BY_EXT[ext], existed: true });
      name = requested;
    }
    await store.put(name, bytes, MIME_BY_EXT[ext]);
    return json({ path: name, mimeType: MIME_BY_EXT[ext] });
  });
}

/** Read an image by name. Only images on cards the user can see are served. */
export async function GET(req: Request) {
  return withUser(req, async (user) => {
    const name = new URL(req.url).searchParams.get('name') ?? '';
    if (!MEDIA_NAME.test(name)) throw new ApiError('Not found', 404);
    const db = await serverDb();
    const visible = await db.select(
      `SELECT 1 FROM card_media m JOIN flashcards f ON f.id = m.flashcard_id JOIN study_sets s ON s.id = f.set_id
       WHERE m.relative_path = ? AND (s.owner_id = ? OR s.visibility = 'shared' OR ? = 'admin') LIMIT 1`,
      [name, user.id, user.role],
    );
    // A freshly uploaded image is not attached yet; its uploader may still preview it.
    const attached = await db.select('SELECT 1 FROM card_media WHERE relative_path = ? LIMIT 1', [
      name,
    ]);
    if (attached.length > 0 && visible.length === 0) throw new ApiError('Not found', 404);
    const bytes = await (await blobStore()).get(name);
    if (!bytes) throw new ApiError('Not found', 404);
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        'content-type': MIME_BY_EXT[ext] ?? 'application/octet-stream',
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  });
}
