'use client';

import { Suspense } from 'react';
import { SetBrowser } from '@/components/flashcards/set-browser';
import { SetGridSkeleton } from '@/components/flashcards/set-card';
import { Page } from '@/components/layout/app-shell';

export default function SharedPage() {
  return (
    <Page
      title="Shared sets"
      description="Sets classmates and teachers on this server have shared with everyone. Study them, or copy one to make it your own."
    >
      <Suspense fallback={<SetGridSkeleton />}>
        <SetBrowser scope="shared" />
      </Suspense>
    </Page>
  );
}
