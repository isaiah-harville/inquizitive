'use client';

import { FolderClosed, FolderPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Page } from '@/components/layout/app-shell';
import { useConfirm } from '@/components/layout/confirm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { plural } from '@/lib/format';

export default function FoldersPage() {
  const { data: folders, isLoading } = useApiQuery(['folders'], (api) => api.listFolders());
  const action = useAction();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    if (editing.id)
      await action((api) => api.renameFolder(editing.id as string, name), {
        success: 'Folder renamed',
      });
    else await action((api) => api.createFolder(name), { success: 'Folder created' });
    setEditing(null);
  };

  return (
    <Page
      title="Folders"
      description="Group related sets — by class, subject or term."
      actions={
        <Button onClick={() => setEditing({ name: '' })}>
          <FolderPlus /> New folder
        </Button>
      }
    >
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !folders?.length ? (
        <Empty className="rounded-2xl border border-dashed bg-dots py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderClosed />
            </EmptyMedia>
            <EmptyTitle>No folders yet</EmptyTitle>
            <EmptyDescription>Folders keep your library tidy as it grows.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setEditing({ name: '' })}>
              <FolderPlus /> Create a folder
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <div key={f.id} className="card-link group relative flex items-center gap-3 p-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <FolderClosed className="size-5" />
              </span>
              <Link
                href={`/library/?folder=${f.id}`}
                className="min-w-0 flex-1 after:absolute after:inset-0"
              >
                <div className="truncate font-medium">{f.name}</div>
                <div className="text-muted-foreground text-xs">{plural(f.setCount, 'set')}</div>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="relative z-10"
                    aria-label={`Actions for ${f.name}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing({ id: f.id, name: f.name })}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={async () => {
                      if (
                        await confirm({
                          title: `Delete “${f.name}”?`,
                          description:
                            'The folder is removed. Its sets are kept and move back to your library.',
                          confirmLabel: 'Delete folder',
                          destructive: true,
                        })
                      ) {
                        await action((api) => api.deleteFolder(f.id), {
                          success: 'Folder deleted',
                        });
                      }
                    }}
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Rename folder' : 'New folder'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="grid gap-4"
          >
            <Input
              autoFocus
              aria-label="Folder name"
              placeholder="e.g. Chemistry 201"
              value={editing?.name ?? ''}
              onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
              maxLength={200}
            />
            <DialogFooter>
              <Button type="submit" disabled={!editing?.name.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
