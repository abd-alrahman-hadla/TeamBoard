'use client';

import { LogOutIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { HOME_PATH, LOGIN_PATH } from '@/features/auth/route-guard';

export function AppHeader() {
  const { state, logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace(LOGIN_PATH);
    }
  };

  return (
    <header className="border-b">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href={HOME_PATH} className="font-semibold tracking-tight">
          TeamBoard
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm" data-testid="current-user">
            {state.user?.name}
          </span>
          <Button variant="outline" size="sm" onClick={() => void handleSignOut()} disabled={signingOut}>
            <LogOutIcon aria-hidden />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
