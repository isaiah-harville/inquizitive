import { cookieHeader } from '@/server/auth';
import { serverConfig } from '@/server/config';
import { errorResponse } from '@/server/http';
import { OIDC_COOKIE, oidcConfig, redirectUri } from '@/server/oidc';
import { ApiError } from '@/services/api/core';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const c = serverConfig();
    if (c.AUTH_MODE !== 'oidc') throw new ApiError('Single sign-on is not enabled', 400);
    const client = await import('openid-client');
    const config = await oidcConfig();
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri(),
      scope: c.OIDC_SCOPES,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    const cookie = cookieHeader(req, OIDC_COOKIE, JSON.stringify({ verifier, state, nonce }), 600);
    return new Response(null, {
      status: 302,
      headers: { location: url.toString(), 'set-cookie': cookie },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
