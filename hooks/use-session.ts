'use client';

import { useQuery } from '@tanstack/react-query';
import type { User } from '@/domain/models';
import { backend } from '@/services/api/client';

export interface SessionInfo {
  user: User | null;
  config: {
    authMode: 'none' | 'local' | 'oidc' | 'proxy';
    allowSignup: boolean;
    needsSetup: boolean;
    oidcProviderName: string;
    maxUploadMb: number;
  };
  backend: ReturnType<typeof backend>;
}

const LOCAL_USER: User = {
  id: 'local',
  username: 'local',
  displayName: 'Me',
  email: null,
  role: 'admin',
  authProvider: 'none',
};

export async function fetchSession(): Promise<SessionInfo> {
  const b = backend();
  if (b !== 'server') {
    return {
      user: LOCAL_USER,
      config: {
        authMode: 'none',
        allowSignup: false,
        needsSetup: false,
        oidcProviderName: '',
        maxUploadMb: 10,
      },
      backend: b,
    };
  }
  const res = await fetch('/api/auth/session/', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not reach the server (${res.status})`);
  return { ...(await res.json()), backend: b };
}

export function useSession() {
  return useQuery({ queryKey: ['session'], queryFn: fetchSession, staleTime: 60_000 });
}

/** True when several people share this instance (sharing, user management, sign-out make sense). */
export function isMultiUser(s: SessionInfo | undefined): boolean {
  return !!s && s.backend === 'server' && s.config.authMode !== 'none';
}
