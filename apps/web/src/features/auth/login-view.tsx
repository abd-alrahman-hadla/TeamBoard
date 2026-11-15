'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { LoginInput } from '@teamboard/shared';
import { AuthCard } from './auth-card';
import { useAuth } from './auth-context';
import { GuestOnly } from './guest-only';
import { LoginForm } from './login-form';
import { safeNextPath } from './route-guard';

export function LoginView() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');

  const handleSubmit = async (input: LoginInput) => {
    await login(input);
    router.replace(safeNextPath(next));
  };

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register';
  return (
    <GuestOnly>
      <AuthCard
        title="Sign in"
        description="Welcome back. Sign in to your boards."
        footer={{ text: 'New to TeamBoard?', linkLabel: 'Create an account', href: registerHref }}
      >
        <LoginForm onSubmit={handleSubmit} />
      </AuthCard>
    </GuestOnly>
  );
}
