'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { FullPageSpinner } from '@/components/full-page-spinner';
import { useAuth } from './auth-context';
import { safeNextPath } from './route-guard';

/** Login/register: signed-in users are sent on to `?next=` (or the home page). */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(safeNextPath(next));
  }, [state.status, router, next]);

  if (state.status !== 'unauthenticated') return <FullPageSpinner label="Loading" />;
  return children;
}
