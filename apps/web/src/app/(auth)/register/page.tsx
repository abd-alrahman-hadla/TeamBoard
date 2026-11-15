import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FullPageSpinner } from '@/components/full-page-spinner';
import { RegisterView } from '@/features/auth/register-view';

export const metadata: Metadata = { title: 'Create account · TeamBoard' };

export default function RegisterPage() {
  return (
    <Suspense fallback={<FullPageSpinner label="Loading" />}>
      <RegisterView />
    </Suspense>
  );
}
