'use client';

import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { useSession } from '@/hooks/use-session';
import { relativeTime } from '@/lib/format';

async function adminUsers(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/users/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json;
}

export default function AdminPage() {
  const { data: session } = useSession();
  const { data: users, refetch } = useApiQuery(['users'], (api) => api.listUsers(), {
    enabled: session?.user?.role === 'admin',
  });
  const action = useAction();
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'reset'; userId: string; username: string } | null
  >(null);
  const [form, setForm] = useState({ username: '', displayName: '', password: '', admin: false });
  const local = session?.config.authMode === 'local';

  if (session?.user?.role !== 'admin') return <Page title="Admin">Admins only.</Page>;

  const submit = async () => {
    try {
      if (dialog?.mode === 'create') {
        await adminUsers({
          username: form.username,
          displayName: form.displayName,
          password: form.password,
          role: form.admin ? 'admin' : 'member',
        });
        toast.success(`Created @${form.username}`);
      } else if (dialog?.mode === 'reset') {
        await adminUsers({ userId: dialog.userId, password: form.password });
        toast.success(`Password reset for @${dialog.username}`);
      }
      setDialog(null);
      void refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Page
      title="Admin"
      description={`Authentication: ${session.config.authMode}. People can${session.config.allowSignup ? '' : 'not'} create their own accounts.`}
      actions={
        local && (
          <Button
            onClick={() => {
              setForm({ username: '', displayName: '', password: '', admin: false });
              setDialog({ mode: 'create' });
            }}
          >
            <UserPlus /> Add user
          </Button>
        )
      }
    >
      <ul className="divide-y divide-border card-raised">
        {users?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary text-sm uppercase">
              {u.displayName.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {u.displayName}
                {u.role === 'admin' && (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="size-3" /> Admin
                  </Badge>
                )}
                {u.disabled && <Badge variant="outline">Disabled</Badge>}
              </div>
              <div className="text-muted-foreground text-xs">
                @{u.username} · {u.authProvider} · last sign-in {relativeTime(u.lastLoginAt)}
              </div>
            </div>
            {u.id !== session.user?.id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      action(
                        (api) => api.setUserRole(u.id, u.role === 'admin' ? 'member' : 'admin'),
                        { success: 'Role updated' },
                      )
                    }
                  >
                    {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </DropdownMenuItem>
                  {local && u.authProvider === 'local' && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setForm((f) => ({ ...f, password: '' }));
                        setDialog({ mode: 'reset', userId: u.id, username: u.username });
                      }}
                    >
                      <KeyRound /> Reset password
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant={u.disabled ? 'default' : 'destructive'}
                    onSelect={() =>
                      action((api) => api.setUserDisabled(u.id, !u.disabled), {
                        success: u.disabled ? 'Enabled' : 'Disabled and signed out',
                      })
                    }
                  >
                    {u.disabled ? 'Enable account' : 'Disable account'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'create'
                ? 'Add a user'
                : `Reset password for @${dialog?.mode === 'reset' ? dialog.username : ''}`}
            </DialogTitle>
            <DialogDescription>
              Share the password with them securely; they can't change it themselves yet.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {dialog?.mode === 'create' && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="u-name">Username</Label>
                  <Input
                    id="u-name"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="u-display">Display name</Label>
                  <Input
                    id="u-display"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="u-pw">Password</Label>
              <Input
                id="u-pw"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
              <span className="text-muted-foreground text-xs">At least 10 characters.</span>
            </div>
            {dialog?.mode === 'create' && (
              <label className="flex items-center justify-between text-sm">
                Administrator{' '}
                <Switch
                  checked={form.admin}
                  onCheckedChange={(v) => setForm({ ...form, admin: v })}
                />
              </label>
            )}
            <DialogFooter>
              <Button type="submit">
                {dialog?.mode === 'create' ? 'Create user' : 'Reset password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
