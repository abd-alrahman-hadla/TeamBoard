import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FullPageSpinner } from '@/components/full-page-spinner';
import { LoginView } from '@/features/auth/login-view';

export const metadata: Metadata = { title: 'Sign in · TeamBoard' };

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageSpinner label="Loading" />}>
      <LoginView />
    </Suspense>
  );
}
