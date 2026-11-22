'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';
import { Logo } from './logo';

/** Blocks rendering until we know who the user is; sends signed-out users to /login on the server build. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, error, isLoading, refetch } = useSession();
  const router = useRouter();
  const signedOut = !!data && !data.user;

  useEffect(() => {
    if (signedOut) router.replace('/login/');
  }, [signedOut, router]);

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo />
        <p className="max-w-sm text-muted-foreground text-sm">{error.message}</p>
        <Button onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }
  if (isLoading || signedOut) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Logo className="animate-pulse opacity-60" />
      </div>
    );
  }
  return <>{children}</>;
}
