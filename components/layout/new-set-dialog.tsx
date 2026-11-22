'use client';

import { ClipboardPaste, PenLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAction } from '@/hooks/use-api';

export function NewSetDialog({
  open,
  onOpenChange,
  folderId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folderId?: string | null;
}) {
  const router = useRouter();
  const action = useAction();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
    }
  }, [open]);

  const create = async (next: 'edit' | 'import') => {
    setBusy(true);
    try {
      const id = await action((api) =>
        api.createSet({ title: title.trim() || 'Untitled set', description, folderId }),
      );
      onOpenChange(false);
      router.push(next === 'edit' ? `/set/edit/?id=${id}&new=1` : `/import/?set=${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New study set</DialogTitle>
          <DialogDescription>
            Give it a name. You can add cards one by one or paste a whole list.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create('edit');
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="new-set-title">Title</Label>
            <Input
              id="new-set-title"
              autoFocus
              placeholder="e.g. Biology — Cell structure"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-set-desc">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="new-set-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => create('import')}
            >
              <ClipboardPaste /> Create &amp; import cards
            </Button>
            <Button type="submit" disabled={busy}>
              <PenLine /> Create &amp; add cards
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
