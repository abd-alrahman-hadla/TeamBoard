import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AppHeader } from '@/components/app-header';
import { FullPageSpinner } from '@/components/full-page-spinner';
import { RequireAuth } from '@/features/auth/require-auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<FullPageSpinner label="Loading" />}>
      <RequireAuth>
        <div className="flex min-h-svh flex-col">
          <AppHeader />
          <main className="flex-1">{children}</main>
        </div>
      </RequireAuth>
    </Suspense>
  );
}
