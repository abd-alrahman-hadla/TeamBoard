'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { FullPageSpinner } from '@/components/full-page-spinner';
import { useAuth } from './auth-context';
import { safeNextPath } from './route-guard';

/**
 * Login/register: signed-in users are sent on to `destination`, else `?next=`, else the home page.
 * The only place that navigates after sign-in, so two redirects never race.
 */
export function GuestOnly({ children, destination }: { children: ReactNode; destination?: string | null }) {
  const { state } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(destination ?? safeNextPath(next));
  }, [state.status, router, next, destination]);

  if (state.status !== 'unauthenticated') return <FullPageSpinner label="Loading" />;
  return children;
}
