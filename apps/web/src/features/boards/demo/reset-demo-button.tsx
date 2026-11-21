'use client';

import { DEMO_BOARD_ID, ERROR_CODES } from '@teamboard/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { notificationKeys } from '@/features/notifications/use-notifications';
import { ApiError, apiVoid } from '@/lib/api-client';
import { errorMessage } from '@/lib/error-message';
import { queryKeys } from '../query-keys';

/** The button only exists on the public demo board, and only in demo mode. */
export function showResetDemo(boardId: string, demoMode: boolean): boolean {
  return demoMode && boardId === DEMO_BOARD_ID;
}

/**
 * Restores the demo board for everyone. Other viewers refetch through the server's
 * `board.resync`; this tab ignores its own echo, so it refetches here.
 */
export function ResetDemoButton({ onReset }: { onReset: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const reset = useMutation({
    mutationFn: () => apiVoid('/demo/reset', { method: 'POST' }),
    onSuccess: async () => {
      onReset(); // an open card may have been one a visitor created, now gone
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.board(DEMO_BOARD_ID) }),
        queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
      ]);
      toast.success('Demo reset. The board is back to its starting point.');
    },
    onError: (error) =>
      toast.error(
        // The cooldown message says how long to wait, which beats the generic rate-limit text.
        error instanceof ApiError && error.code === ERROR_CODES.rateLimited
          ? error.message
          : errorMessage(error, "Couldn't reset the demo. Try again in a moment."),
      ),
  });

  return (
    <>
      <Button variant="outline" size="sm" disabled={reset.isPending} onClick={() => setConfirming(true)}>
        <RotateCcwIcon aria-hidden className={reset.isPending ? 'animate-spin' : undefined} />
        {reset.isPending ? 'Resetting…' : 'Reset demo'}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
            <AlertDialogDescription>
              This puts the demo board back to its starting cards and comments for everyone viewing it. Your
              changes and other visitors&apos; changes are discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reset.mutate()}>Reset demo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
