'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { FullPageSpinner } from '@/components/full-page-spinner';
import { useAuth } from './auth-context';
import { loginPathFor } from './route-guard';

/** Client-side gate for protected pages. Middleware handles the common case; this covers a stale hint cookie. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (state.status !== 'unauthenticated') return;
    const query = searchParams.toString();
    router.replace(loginPathFor(query ? `${pathname}?${query}` : pathname));
  }, [state.status, router, pathname, searchParams]);

  if (state.status !== 'authenticated') return <FullPageSpinner label="Checking your session" />;
  return children;
}
