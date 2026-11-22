'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/hooks/use-session';

function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, refetch } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(params.get('error'));
  const [busy, setBusy] = useState(false);
  const config = session?.config;
  const setup = !!config?.needsSetup;

  useEffect(() => {
    if (session?.user) router.replace('/');
  }, [session?.user, router]);

  useEffect(() => {
    if (setup) setMode('signup');
  }, [setup]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === 'signin' ? '/api/auth/login/' : '/api/auth/signup/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password, displayName }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Sign-in failed');
      await refetch();
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-dots p-4">
      <div className="w-full max-w-sm card-raised rounded-3xl p-8 shadow-xl shadow-foreground/5">
        <Logo className="mb-6" />
        <h1 className="font-semibold text-xl">
          {setup
            ? 'Set up Inquizitive'
            : mode === 'signin'
              ? 'Welcome back'
              : 'Create your account'}
        </h1>
        <p className="mt-1 mb-6 text-muted-foreground text-sm">
          {setup
            ? 'Create the first account. It becomes the administrator.'
            : mode === 'signin'
              ? 'Sign in to study.'
              : 'Pick a username and password.'}
        </p>

        {config?.authMode === 'oidc' ? (
          <Button className="w-full" size="lg" asChild>
            <a href="/api/auth/oidc/start/">
              <KeyRound /> Continue with {config.oidcProviderName}
            </a>
          </Button>
        ) : config?.authMode === 'proxy' ? (
          <p className="text-muted-foreground text-sm">
            This server signs you in through your organization's login. Reload the page, or contact
            your administrator.
          </p>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
            {mode === 'signup' && (
              <div className="grid gap-1.5">
                <Label htmlFor="display">Display name</Label>
                <Input
                  id="display"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 10 : undefined}
              />
              {mode === 'signup' && (
                <span className="text-muted-foreground text-xs">At least 10 characters.</span>
              )}
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 p-2.5 text-destructive text-sm"
              >
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === 'signin' ? 'Sign in' : setup ? 'Create admin account' : 'Create account'}
            </Button>
            {!setup && config?.allowSignup && (
              <button
                type="button"
                className="text-muted-foreground text-sm hover:text-foreground"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              >
                {mode === 'signin'
                  ? 'New here? Create an account'
                  : 'Already have an account? Sign in'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
