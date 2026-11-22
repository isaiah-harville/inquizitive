import { cookieHeader, provisionUser, readCookie, startSession } from '@/server/auth';
import { serverConfig } from '@/server/config';
import { serverDb } from '@/server/db';
import { claimGrantsAdmin, emailAllowed, OIDC_COOKIE, oidcConfig } from '@/server/oidc';
import { ApiError } from '@/services/api/core';
import { findUserByExternalId, updateUserProfile } from '@/services/repositories/users';

export const dynamic = 'force-dynamic';

function fail(req: Request, message: string) {
  const url = new URL('/login/', serverConfig().APP_URL ?? req.url);
  url.searchParams.set('error', message);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

export async function GET(req: Request) {
  try {
    const c = serverConfig();
    if (c.AUTH_MODE !== 'oidc') throw new ApiError('Single sign-on is not enabled', 400);
    const raw = readCookie(req, OIDC_COOKIE);
    if (!raw) return fail(req, 'Your sign-in attempt expired. Please try again.');
    const checks = JSON.parse(raw) as { verifier: string; state: string; nonce: string };
    const client = await import('openid-client');
    const config = await oidcConfig();
    // Rebuild the callback URL on the public origin (we may be behind a proxy).
    const current = new URL(new URL(req.url).pathname + new URL(req.url).search, c.APP_URL);
    const tokens = await client.authorizationCodeGrant(config, current, {
      pkceCodeVerifier: checks.verifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
    });
    const claims = (tokens.claims() ?? {}) as Record<string, unknown>;
    const subject = String(claims.sub ?? '');
    const email = typeof claims.email === 'string' ? claims.email : null;
    if (!subject) return fail(req, 'The identity provider did not return a user id.');
    if (!emailAllowed(email))
      return fail(req, "Your account's email domain is not allowed on this server.");

    const db = await serverDb();
    const admin = claimGrantsAdmin(claims);
    const name = String(claims.name ?? claims.preferred_username ?? email ?? subject);
    let user = await findUserByExternalId(db, 'oidc', subject);
    if (!user) {
      const username = String(claims.preferred_username ?? email?.split('@')[0] ?? subject);
      await provisionUser(db, {
        username,
        displayName: name,
        email,
        provider: 'oidc',
        externalId: subject,
        admin,
      });
      user = await findUserByExternalId(db, 'oidc', subject);
    } else {
      await updateUserProfile(db, user.id, {
        displayName: name,
        email,
        ...(admin ? { role: 'admin' } : {}),
      });
    }
    if (!user) throw new Error('could not provision user');

    const session = await startSession(req, user.id);
    const headers = new Headers({ location: new URL('/', c.APP_URL).toString() });
    headers.append('set-cookie', session);
    headers.append('set-cookie', cookieHeader(req, OIDC_COOKIE, '', 0));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error('[inquizitive] OIDC callback failed:', e);
    return fail(req, 'Single sign-on failed. Please try again or contact your administrator.');
  }
}
