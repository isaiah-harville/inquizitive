'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/layout/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiQuery } from '@/hooks/use-api';
import { plural, relativeTime } from '@/lib/format';
import {
  connectToServer,
  disconnectFromServer,
  loadSyncSettings,
  syncNow,
} from '@/services/sync/desktop';

/** Desktop settings: link this app to an Inquizitive server and sync the library. */
export function DesktopSync() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: settings, refetch } = useApiQuery(['sync-settings'], loadSyncSettings);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await syncNow();
      await queryClient.invalidateQueries();
      toast.success('Synced', {
        description: `${plural(r.pushed, 'change')} sent, ${plural(r.pulled, 'change')} received${
          r.deletedHere + r.deletedThere ? `, ${r.deletedHere + r.deletedThere} deleted` : ''
        }.${r.missingMedia.length ? ` ${plural(r.missingMedia.length, 'image')} could not be copied.` : ''}`,
      });
    } catch (e) {
      toast.error('Sync failed', { description: e instanceof Error ? e.message : String(e) });
      void refetch();
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      await connectToServer(url, token);
      setToken('');
      await refetch();
    } catch (e) {
      toast.error("Couldn't connect", { description: e instanceof Error ? e.message : String(e) });
      setBusy(false);
      return;
    }
    setBusy(false);
    await run();
  };

  if (!settings) {
    return (
      <form
        className="grid max-w-md gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <p className="text-muted-foreground text-sm">
          Keep this library in step with your account on a school or self-hosted Inquizitive server.
          Create a token there under Settings → Desktop sync.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="sync-url">Server address</Label>
          <Input
            id="sync-url"
            placeholder="https://study.example.edu"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="url"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sync-token">Sync token</Label>
          <Input
            id="sync-token"
            placeholder="iqz_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="font-mono"
            autoComplete="off"
          />
        </div>
        <Button type="submit" className="w-fit" disabled={busy || !url.trim() || !token.trim()}>
          {busy && <Loader2 className="animate-spin" />} Connect and sync
        </Button>
      </form>
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <dl className="grid gap-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Server</dt>
          <dd className="truncate font-medium">{settings.serverUrl}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Last synced</dt>
          <dd>{relativeTime(settings.lastSyncAt)}</dd>
        </div>
      </dl>
      {settings.lastError && (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-destructive text-sm">
          <CloudOff className="mt-0.5 size-4 shrink-0" /> {settings.lastError}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Syncs automatically at launch and every 15 minutes.
      </p>
      <div className="flex gap-2">
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (
              await confirm({
                title: 'Stop syncing?',
                description:
                  'Your library stays on this computer and on the server; they just stop updating each other.',
                confirmLabel: 'Disconnect',
              })
            ) {
              await disconnectFromServer();
              await refetch();
            }
          }}
        >
          <Unplug /> Disconnect
        </Button>
      </div>
    </div>
  );
}
