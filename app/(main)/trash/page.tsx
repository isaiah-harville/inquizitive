'use client';

import { RotateCcw, Trash2 } from 'lucide-react';
import { Page } from '@/components/layout/app-shell';
import { useConfirm } from '@/components/layout/confirm';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { plural, relativeTime } from '@/lib/format';
import { TRASH_RETENTION_DAYS } from '@/services/repositories/sets';

export default function TrashPage() {
  const { data: trash } = useApiQuery(['trash'], (api) => api.listTrash());
  const action = useAction();
  const confirm = useConfirm();

  return (
    <Page
      title="Trash"
      description={`Deleted sets stay here for ${TRASH_RETENTION_DAYS} days before they are removed for good.`}
      actions={
        !!trash?.length && (
          <Button
            variant="destructive"
            onClick={async () => {
              if (
                await confirm({
                  title: 'Empty trash?',
                  description: `${plural(trash.length, 'set')} and all their cards and history will be permanently deleted. This can't be undone.`,
                  confirmLabel: 'Delete forever',
                  destructive: true,
                })
              )
                await action((api) => api.emptyTrash(), { success: 'Trash emptied' });
            }}
          >
            <Trash2 /> Empty trash
          </Button>
        )
      }
    >
      {!trash?.length ? (
        <Empty className="rounded-2xl border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2 />
            </EmptyMedia>
            <EmptyTitle>Trash is empty</EmptyTitle>
            <EmptyDescription>Sets you delete can be restored from here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border card-raised">
          {trash.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.title}</div>
                <div className="text-muted-foreground text-xs">
                  {plural(s.cardCount, 'card')} · deleted {relativeTime(s.deletedAt)}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  action((api) => api.restoreSet(s.id), { success: `Restored “${s.title}”` })
                }
              >
                <RotateCcw /> Restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete “${s.title}” forever?`,
                      description: 'Its cards and study history will be permanently removed.',
                      confirmLabel: 'Delete forever',
                      destructive: true,
                    })
                  )
                    await action((api) => api.purgeSet(s.id), { success: 'Deleted' });
                }}
              >
                Delete forever
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
