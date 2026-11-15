'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { meRequest } from '@/features/auth/auth-api';

/** Phase 4 replaces this with the workspace list. Fetching /auth/me exercises the authenticated API path. */
export function WorkspacesPlaceholder() {
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: meRequest });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
      <Card>
        <CardHeader>
          <CardTitle>No workspaces yet</CardTitle>
          <CardDescription>Workspaces and boards arrive in the next phases.</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm" data-testid="me-status">
          {me.isPending && 'Loading your profile…'}
          {me.isError && 'Could not load your profile.'}
          {me.isSuccess && (
            <>
              Signed in as <span className="text-foreground font-medium">{me.data.email}</span>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
