'use client';

import { type UseQueryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { type Api, getApi } from '@/services/api/client';

/** Query through the app API. Keys should start with a stable namespace, e.g. ["set", id]. */
export function useApiQuery<T>(
  key: readonly unknown[],
  fn: (api: Api) => Promise<T>,
  opts: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<T>({ queryKey: key, queryFn: async () => fn(await getApi()), ...opts });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Run a mutation, refresh cached data, and surface failures as toasts
 * (errors are never swallowed silently).
 */
export function useAction() {
  const qc = useQueryClient();
  return useCallback(
    async <T>(
      fn: (api: Api) => Promise<T>,
      opts: { success?: string; error?: string; refresh?: boolean } = {},
    ) => {
      try {
        const result = await fn(await getApi());
        if (opts.refresh !== false) await qc.invalidateQueries();
        if (opts.success) toast.success(opts.success);
        return result;
      } catch (e) {
        toast.error(opts.error ?? 'Something went wrong', { description: errorMessage(e) });
        throw e;
      }
    },
    [qc],
  );
}
