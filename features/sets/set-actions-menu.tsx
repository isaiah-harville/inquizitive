'use client';

import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  FolderInput,
  Globe,
  Lock,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportArchive, exportSetText } from '@/features/import-export/export-actions';
import { useAction, useApiQuery } from '@/hooks/use-api';
import type { SetDetail } from '@/services/api/core';

/** The set page's ⋯ menu: import, duplicate, export, share, move, reset, archive, delete. */
export function SetActionsMenu({
  detail,
  mine,
  multi,
}: {
  detail: SetDetail;
  mine: boolean;
  multi: boolean;
}) {
  const data = detail;
  const { set, canEdit } = detail;
  const router = useRouter();
  const action = useAction();
  const confirm = useConfirm();
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<string>('none');
  const { data: folders } = useApiQuery(['folders'], (api) => api.listFolders(), {
    enabled: canEdit && mine,
  });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {canEdit && (
            <DropdownMenuItem asChild>
              <Link href={`/import/?set=${set.id}`}>
                <Upload /> Import cards
              </Link>
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              onSelect={async () => {
                const copy = await action((api) => api.duplicateSet(set.id), {
                  success: 'Set duplicated',
                });
                router.push(`/set/?id=${copy}`);
              }}
            >
              <Copy /> Duplicate
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download /> Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => exportSetText(data, 'csv')}>
                CSV (spreadsheets)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportSetText(data, 'tsv')}>
                TSV / tab-separated
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => exportArchive({ setIds: [set.id], name: set.title })}
              >
                Inquizitive archive (.zip)
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  exportArchive({ setIds: [set.id], name: set.title, includeProgress: true })
                }
              >
                Archive with my progress
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {canEdit && multi && (
            <DropdownMenuItem
              onSelect={() =>
                action(
                  (api) =>
                    api.updateSet(set.id, {
                      visibility: set.visibility === 'shared' ? 'private' : 'shared',
                    }),
                  {
                    success:
                      set.visibility === 'shared'
                        ? 'Set is now private'
                        : 'Shared with everyone on this server',
                  },
                )
              }
            >
              {set.visibility === 'shared' ? <Lock /> : <Globe />}
              {set.visibility === 'shared' ? 'Make private' : 'Share with everyone'}
            </DropdownMenuItem>
          )}
          {canEdit && mine && (
            <DropdownMenuItem
              onSelect={() => {
                setMoveTo(set.folderId ?? 'none');
                setMoveOpen(true);
              }}
            >
              <FolderInput /> Move to folder
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              if (
                await confirm({
                  title: 'Reset your progress?',
                  description:
                    'Stars, known/unknown marks and review schedules for this set are cleared. Your study history is kept.',
                  confirmLabel: 'Reset',
                })
              )
                await action((api) => api.resetProgress(set.id), { success: 'Progress reset' });
            }}
          >
            <RotateCcw /> Reset my progress
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem
              onSelect={() =>
                action((api) => api.archiveSet(set.id, !set.archivedAt), {
                  success: set.archivedAt ? 'Unarchived' : 'Archived',
                })
              }
            >
              {set.archivedAt ? <ArchiveRestore /> : <Archive />}
              {set.archivedAt ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={async () => {
                if (
                  await confirm({
                    title: `Delete “${set.title}”?`,
                    description: 'It moves to the trash, where you can restore it for 30 days.',
                    confirmLabel: 'Move to trash',
                    destructive: true,
                  })
                ) {
                  await action((api) => api.trashSet(set.id), { success: 'Moved to trash' });
                  router.push('/library/');
                }
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
          </DialogHeader>
          <Select value={moveTo} onValueChange={setMoveTo}>
            <SelectTrigger aria-label="Folder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No folder</SelectItem>
              {folders?.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!folders?.length && (
            <p className="text-muted-foreground text-sm">
              You have no folders yet.{' '}
              <Link className="underline" href="/folders/">
                Create one
              </Link>
              .
            </p>
          )}
          <DialogFooter>
            <Button
              onClick={async () => {
                await action(
                  (api) => api.updateSet(set.id, { folderId: moveTo === 'none' ? null : moveTo }),
                  {
                    success: 'Moved',
                  },
                );
                setMoveOpen(false);
              }}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
