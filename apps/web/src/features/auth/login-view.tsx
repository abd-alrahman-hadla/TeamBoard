'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { LoginInput } from '@teamboard/shared';
import { env } from '@/lib/env';
import { AuthCard } from './auth-card';
import { useAuth } from './auth-context';
import { DEMO_BOARD_PATH, DemoLogin } from './demo-login';
import { GuestOnly } from './guest-only';
import { LoginForm } from './login-form';
import { safeNextPath } from './route-guard';

export function LoginView() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  // Demo sign-in lands on the demo board (unless a ?next= link brought the visitor here).
  const [destination, setDestination] = useState<string | null>(null);

  const handleSubmit = async (input: LoginInput) => {
    await login(input);
    router.replace(safeNextPath(next));
  };

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register';
  return (
    <GuestOnly destination={destination}>
      <AuthCard
        title="Sign in"
        description="Welcome back. Sign in to your boards."
        footer={{ text: 'New to TeamBoard?', linkLabel: 'Create an account', href: registerHref }}
      >
        <div className="space-y-6">
          {env.NEXT_PUBLIC_DEMO_MODE && (
            <DemoLogin
              onLogin={async (account, password) => {
                setDestination(next ? safeNextPath(next) : DEMO_BOARD_PATH);
                try {
                  await login({ email: account.email, password });
                } catch (error) {
                  setDestination(null);
                  throw error;
                }
              }}
            />
          )}
          <LoginForm onSubmit={handleSubmit} />
        </div>
      </AuthCard>
    </GuestOnly>
  );
}
