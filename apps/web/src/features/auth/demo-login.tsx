'use client';

import { DEMO_ACCOUNTS, DEMO_BOARD_ID, DEMO_PASSWORD, type DemoAccount } from '@teamboard/shared';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-message';
import { FormAlert } from './form-alert';

export const DEMO_BOARD_PATH = `/b/${DEMO_BOARD_ID}`;

interface DemoLoginProps {
  onLogin: (account: DemoAccount, password: string) => Promise<unknown>;
}

/** One-click sign-in as a published demo user (only rendered with NEXT_PUBLIC_DEMO_MODE). */
export function DemoLogin({ onLogin }: DemoLoginProps) {
  const [pending, setPending] = useState<DemoAccount['key'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (account: DemoAccount) => {
    setPending(account.key);
    setError(null);
    try {
      await onLogin(account, DEMO_PASSWORD);
    } catch (e) {
      setError(errorMessage(e, 'The demo is resetting. Try again in a minute.'));
      setPending(null);
    }
  };

  return (
    <section aria-labelledby="demo-heading" className="bg-muted/50 space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 id="demo-heading" className="flex items-center gap-2 text-sm font-semibold">
          <SparklesIcon className="size-4" aria-hidden />
          Try the live demo
        </h2>
        <p className="text-muted-foreground text-xs">
          Sign in as Sara here and as Omar in a second browser (or a private window), then watch every change
          appear in both. The demo resets every night.
        </p>
      </div>
      <FormAlert message={error} />
      <div className="grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map((account) => (
          <Button
            key={account.key}
            type="button"
            variant="secondary"
            disabled={pending !== null}
            onClick={() => void signIn(account)}
          >
            {pending === account.key && <Loader2Icon className="animate-spin" aria-hidden />}
            Sign in as {account.name.split(' ')[0]}
          </Button>
        ))}
      </div>
    </section>
  );
}
