import type { Configuration } from 'openid-client';
import { serverConfig } from './config';

let config: Promise<Configuration> | null = null;

export async function oidcConfig(): Promise<Configuration> {
  config ??= (async () => {
    const c = serverConfig();
    const client = await import('openid-client');
    // Without a secret this is a public client: PKCE alone protects the code exchange.
    return c.OIDC_CLIENT_SECRET
      ? client.discovery(
          new URL(c.OIDC_ISSUER as string),
          c.OIDC_CLIENT_ID as string,
          c.OIDC_CLIENT_SECRET,
        )
      : client.discovery(
          new URL(c.OIDC_ISSUER as string),
          c.OIDC_CLIENT_ID as string,
          undefined,
          client.None(),
        );
  })();
  config.catch(() => {
    config = null;
  });
  return config;
}

export function redirectUri(): string {
  return new URL('/api/auth/oidc/callback', serverConfig().APP_URL).toString();
}

/**
 * The callback URL to hand to the token exchange. It must equal the
 * redirect_uri sent when signing in, so it is rebuilt from `base` with only
 * the query copied: the request path may carry a trailing slash (trailingSlash
 * redirects) and the request origin may be an internal one behind a proxy.
 */
export function callbackUrl(base: string, requestUrl: string): URL {
  const url = new URL(base);
  url.search = new URL(requestUrl).search;
  return url;
}

export const OIDC_COOKIE = 'iq_oidc';

/** Is this email allowed by OIDC_ALLOWED_DOMAINS? */
export function emailAllowed(email: string | null | undefined): boolean {
  const domains = serverConfig()
    .OIDC_ALLOWED_DOMAINS.split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return true;
  const domain = email?.split('@')[1]?.toLowerCase();
  return !!domain && domains.includes(domain);
}

/** Does the claim (string or array) contain the configured admin value? */
export function claimGrantsAdmin(claims: Record<string, unknown>): boolean {
  const c = serverConfig();
  if (!c.OIDC_ADMIN_VALUE) return false;
  const v = claims[c.OIDC_ADMIN_CLAIM];
  return Array.isArray(v) ? v.includes(c.OIDC_ADMIN_VALUE) : v === c.OIDC_ADMIN_VALUE;
}
