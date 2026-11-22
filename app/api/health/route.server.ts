import { serverDb } from '@/server/db';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Liveness/readiness probe: also checks the database is reachable. */
export async function GET() {
  try {
    const db = await serverDb();
    await db.select('SELECT 1 AS ok');
    return json({ status: 'ok' });
  } catch (e) {
    return json(
      { status: 'error', error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
