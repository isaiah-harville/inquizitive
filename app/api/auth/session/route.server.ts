import { currentUser } from '@/server/auth';
import { publicConfig } from '@/server/config';
import { serverDb } from '@/server/db';
import { errorResponse, json } from '@/server/http';
import { countUsers } from '@/services/repositories/users';

export const dynamic = 'force-dynamic';

/** Who am I, plus the public auth configuration for the sign-in screen. */
export async function GET(req: Request) {
  try {
    const config = publicConfig();
    const user = await currentUser(req);
    const needsSetup = config.authMode === 'local' && (await countUsers(await serverDb())) === 0;
    return json({ user, config: { ...config, needsSetup } });
  } catch (e) {
    return errorResponse(e);
  }
}
