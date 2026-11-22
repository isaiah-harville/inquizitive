import { endSession } from '@/server/auth';
import { errorResponse, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    return json({ ok: true }, { headers: { 'set-cookie': await endSession(req) } });
  } catch (e) {
    return errorResponse(e);
  }
}
