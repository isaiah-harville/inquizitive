'use client';

import { Check, Copy, KeyRound, Laptop, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/layout/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiQuery } from '@/hooks/use-api';
import { relativeTime } from '@/lib/format';
import type { ApiToken } from '@/services/repositories/tokens';

async function devicesRequest<T>(init?: RequestInit, query = ''): Promise<T> {
  const res = await fetch(`/api/devices/${query}`, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

/** Server settings: create and revoke the tokens desktop apps use to sync. */
export function DeviceTokens() {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data, refetch } = useApiQuery(['devices'], async () =>
    devicesRequest<{ devices: ApiToken[] }>(),
  );

  const create = async () => {
    try {
      const res = await devicesRequest<{ token: string }>({
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || 'Desktop app' }),
      });
      setCreated(res.token);
      setCopied(false);
      setName('');
      void refetch();
    } catch (e) {
      toast.error("Couldn't create a token", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const revoke = async (device: ApiToken) => {
    if (
      !(await confirm({
        title: `Disconnect “${device.name}”?`,
        description:
          'That device stops syncing until you give it a new token. Its local copy is kept.',
        confirmLabel: 'Disconnect',
        destructive: true,
      }))
    )
      return;
    await devicesRequest({ method: 'DELETE' }, `?id=${encodeURIComponent(device.id)}`);
    void refetch();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        In the Inquizitive desktop app, open Settings → Sync with a server, then paste this server's
        address (
        <code className="rounded bg-muted px-1">
          {typeof window === 'undefined' ? '' : window.location.origin}
        </code>
        ) and a token from here.
      </p>
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input
          placeholder="Device name, e.g. School laptop"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Device name"
          maxLength={80}
        />
        <Button type="submit">
          <KeyRound /> Create token
        </Button>
      </form>
      {created && (
        <div className="flex max-w-xl flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="font-semibold text-sm">Copy this token now. It won't be shown again.</div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={created}
              className="font-mono text-xs"
              aria-label="New sync token"
            />
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(created);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
      {!!data?.devices.length && (
        <ul className="max-w-xl divide-y divide-border rounded-xl border">
          {data.devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-3">
              <Laptop className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{d.name}</div>
                <div className="text-muted-foreground text-xs">
                  Created {relativeTime(d.createdAt)} · last synced {relativeTime(d.lastUsedAt)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Disconnect ${d.name}`}
                onClick={() => revoke(d)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
