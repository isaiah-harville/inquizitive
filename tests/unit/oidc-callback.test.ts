import { describe, expect, it } from 'vitest';
import { callbackUrl } from '@/server/oidc';

describe('callbackUrl', () => {
  const base = 'https://quiz.example.edu/api/auth/oidc/callback';

  it('drops the trailing slash Next adds so the token redirect_uri matches sign-in', () => {
    const url = callbackUrl(
      base,
      'http://10.0.0.5:3000/api/auth/oidc/callback/?code=abc&state=xyz',
    );
    expect(url.origin + url.pathname).toBe(base);
    expect(url.searchParams.get('code')).toBe('abc');
    expect(url.searchParams.get('state')).toBe('xyz');
  });

  it('uses the public origin, not the internal one behind a proxy', () => {
    expect(callbackUrl(base, 'http://inquizitive:80/api/auth/oidc/callback?code=1').origin).toBe(
      'https://quiz.example.edu',
    );
  });
});
