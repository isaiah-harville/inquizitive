'use client';

import { Suspense } from 'react';
import { SetBrowser } from '@/components/flashcards/set-browser';
import { SetGridSkeleton } from '@/components/flashcards/set-card';
import { Page } from '@/components/layout/app-shell';

export default function RecentPage() {
  return (
    <Page title="Recent" description="Everything you've studied, most recent first.">
      <Suspense fallback={<SetGridSkeleton />}>
        <SetBrowser scope="studied" />
      </Suspense>
    </Page>
  );
}
