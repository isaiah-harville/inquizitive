import { AuthGate } from '@/components/layout/auth-gate';

/** Study modes use a focused, distraction-free layout (no sidebar). */
export default function StudyLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-svh flex-col bg-background">{children}</div>
    </AuthGate>
  );
}
