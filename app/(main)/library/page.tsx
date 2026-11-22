'use client';

import { Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { SetBrowser } from '@/components/flashcards/set-browser';
import { SetGridSkeleton } from '@/components/flashcards/set-card';
import { Page } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';

export default function LibraryPage() {
  return (
    <Page
      title="Library"
      description="All of your study sets."
      actions={
        <>
          <Button variant="ghost" asChild>
            <Link href="/trash/">
              <Trash2 /> Trash
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/import/">
              <Upload /> Import
            </Link>
          </Button>
        </>
      }
    >
      <Suspense fallback={<SetGridSkeleton />}>
        <SetBrowser scope="mine" />
      </Suspense>
    </Page>
  );
}
