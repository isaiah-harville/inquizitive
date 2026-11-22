'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StudySet } from '@/domain/models';
import { useAction, useApiQuery } from '@/hooks/use-api';
import { isMultiUser, useSession } from '@/hooks/use-session';

/** Tags, folder and (on shared servers) visibility; each saves on change. */
export function SetMetaFields({ set }: { set: StudySet & { tags: string[] } }) {
  const id = set.id;
  const action = useAction();
  const { data: session } = useSession();
  const { data: folders } = useApiQuery(['folders'], (api) => api.listFolders());
  const [tags, setTags] = useState(set.tags.join(', '));
  const data = { set };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          value={tags}
          placeholder="biology, chapter 3"
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => action((api) => api.setTags(id, tags.split(',')), { refresh: false })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Folder</Label>
        <Select
          defaultValue={data.set.folderId ?? 'none'}
          onValueChange={(v) =>
            action((api) => api.updateSet(id, { folderId: v === 'none' ? null : v }), {
              refresh: false,
            })
          }
        >
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
      </div>
      {isMultiUser(session) && (
        <div className="grid gap-1.5">
          <Label>Visibility</Label>
          <Select
            defaultValue={data.set.visibility}
            onValueChange={(v) =>
              action((api) => api.updateSet(id, { visibility: v as 'private' | 'shared' }), {
                refresh: false,
              })
            }
          >
            <SelectTrigger aria-label="Visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private — only me</SelectItem>
              <SelectItem value="shared">Shared — everyone on this server can study it</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
