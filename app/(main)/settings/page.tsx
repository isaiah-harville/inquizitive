'use client';

import {
  Archive,
  DatabaseBackup,
  Download,
  HardDrive,
  Info,
  LogOut,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Page } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { exportArchive } from '@/features/import-export/export-actions';
import { LibraryImport } from '@/features/import-export/library-import';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { isMultiUser, useSession } from '@/hooks/use-session';

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b py-8 first:pt-0 last:border-0 md:grid-cols-[16rem_1fr]">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" /> {title}
        </h2>
        {description && <p className="mt-1 text-muted-foreground text-sm">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

function AppInfo() {
  const [info, setInfo] = useState<{
    dbPath: string;
    mediaDir: string;
    schemaVersion: number;
    version: string;
  } | null>(null);
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.backend !== 'desktop') return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<typeof info>('app_info').then(setInfo))
      .catch(() => {});
  }, [session?.backend]);
  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Running as</dt>
        <dd>
          {session?.backend === 'desktop'
            ? 'Desktop app'
            : session?.backend === 'browser'
              ? 'Browser (stored in this browser)'
              : 'Server'}
        </dd>
      </div>
      {info && (
        <>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Version</dt>
            <dd>{info.version}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Library file</dt>
            <dd className="truncate font-mono text-xs" title={info.dbPath}>
              {info.dbPath}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Schema</dt>
            <dd>v{info.schemaVersion}</dd>
          </div>
        </>
      )}
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Network</dt>
        <dd>No telemetry. No external requests.</dd>
      </div>
    </dl>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const action = useAction();
  const { data: settings } = useApiQuery(['settings'], (api) => api.getSettings());
  const [includeProgress, setIncludeProgress] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const multi = isMultiUser(session);

  useEffect(() => {
    if (session?.user) setDisplayName(session.user.displayName);
  }, [session?.user]);

  const autoplay = (settings?.studyAutoAdvance as boolean | undefined) ?? true;

  return (
    <Page title="Settings">
      <div className="card-raised p-6 sm:p-8">
        <Section icon={Sun} title="Appearance" description="Light, dark, or follow your system.">
          <ToggleGroup
            type="single"
            variant="outline"
            value={theme ?? 'system'}
            onValueChange={(v) => v && setTheme(v)}
            className="w-fit"
          >
            <ToggleGroupItem value="light" className="px-4">
              <Sun /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" className="px-4">
              <Moon /> Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="px-4">
              <Monitor /> System
            </ToggleGroupItem>
          </ToggleGroup>
        </Section>

        {multi && session?.user && (
          <Section
            icon={Info}
            title="Account"
            description={`Signed in as @${session.user.username}`}
          >
            <div className="grid max-w-sm gap-2">
              <Label htmlFor="display-name">Display name</Label>
              <div className="flex gap-2">
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    action((api) => api.updateProfile({ displayName }), { success: 'Saved' })
                  }
                  disabled={!displayName.trim() || displayName === session.user.displayName}
                >
                  Save
                </Button>
              </div>
            </div>
            {session.config.authMode !== 'proxy' && (
              <Button
                variant="outline"
                className="w-fit"
                onClick={async () => {
                  await fetch('/api/auth/logout/', { method: 'POST', credentials: 'same-origin' });
                  window.location.assign('/login/');
                }}
              >
                <LogOut /> Sign out
              </Button>
            )}
          </Section>
        )}

        <Section
          icon={DatabaseBackup}
          title="Backup & export"
          description="A complete, portable copy of your library: sets, folders, cards, images and (optionally) your study history."
        >
          <label className="flex max-w-md items-center justify-between gap-4 text-sm">
            Include study progress and review history
            <Switch checked={includeProgress} onCheckedChange={setIncludeProgress} />
          </label>
          <Button
            className="w-fit"
            onClick={() => exportArchive({ name: 'inquizitive-backup', includeProgress })}
          >
            <Download /> Export entire library
          </Button>
          <p className="text-muted-foreground text-xs">
            Saves a .zip you can keep anywhere, restore later, or open on another device or server.
          </p>
        </Section>

        <Section
          icon={Archive}
          title="Restore or import"
          description="Bring in a backup or an export from someone else. Your existing library is never overwritten."
        >
          <LibraryImport />
        </Section>

        <Section
          icon={HardDrive}
          title="Study"
          description="Small preferences that apply to every set."
        >
          <label className="flex max-w-md items-center justify-between gap-4 text-sm">
            Move on automatically after a correct answer in Learn
            <Switch
              checked={autoplay}
              onCheckedChange={(v) => action((api) => api.setSetting('studyAutoAdvance', v))}
            />
          </label>
        </Section>

        <Section
          icon={Info}
          title="About"
          description="Inquizitive is free, open-source software (MIT)."
        >
          <AppInfo />
        </Section>
      </div>
    </Page>
  );
}
