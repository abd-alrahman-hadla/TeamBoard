'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { RegisterInput } from '@teamboard/shared';
import { AuthCard } from './auth-card';
import { useAuth } from './auth-context';
import { GuestOnly } from './guest-only';
import { RegisterForm } from './register-form';
import { safeNextPath } from './route-guard';

export function RegisterView() {
  const { register } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');

  const handleSubmit = async (input: RegisterInput) => {
    await register(input);
    router.replace(safeNextPath(next));
  };

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
  return (
    <GuestOnly>
      <AuthCard
        title="Create your account"
        description="Start organising work with your team."
        footer={{ text: 'Already have an account?', linkLabel: 'Sign in', href: loginHref }}
      >
        <RegisterForm onSubmit={handleSubmit} />
      </AuthCard>
    </GuestOnly>
  );
}
