'use client';

import type { Card } from '@teamboard/shared';
import { ChevronRightIcon, EyeIcon, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { BoardProvider, useNow } from './board-context';
import { allCards, boardLabels } from './board-cache';
import { CardDialog } from './card-dialog/card-dialog';
import { BoardDnd } from './dnd/board-dnd';
import type { ColumnOrder } from './dnd/dnd-logic';
import { filterCards } from './filters/filter-cards';
import { FilterToolbar } from './filters/filter-toolbar';
import { useBoardFilters } from './filters/use-board-filters';
import { BoardActivitySheet } from './activity/board-activity-sheet';
import { PresenceAvatars } from './realtime/presence-avatars';
import { useBoardRealtime } from './realtime/use-board-realtime';
import { useBoardContext, useBoardQuery } from './use-board';
import { useBoardMutations } from './use-board-mutations';

function BoardSkeleton() {
  return (
    <div className="flex gap-3 p-4" aria-busy="true" aria-label="Loading board">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-72 shrink-0 space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function BoardView({ boardId }: { boardId: string }) {
  const board = useBoardQuery(boardId);
  const context = useBoardContext(board.data?.workspaceId);
  const mutations = useBoardMutations(boardId);
  const { state: auth } = useAuth();
  const meId = auth.user?.id ?? null;
  const realtime = useBoardRealtime(boardId, board.data?.workspaceId, board.isSuccess);
  const [filters, setFilters] = useBoardFilters();
  const now = useNow();

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openCardId = params.get('card');

  const withCard = useCallback(
    (cardId: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (cardId) next.set('card', cardId);
      else next.delete('card');
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );
  const openCard = useCallback(
    (cardId: string) => router.push(withCard(cardId), { scroll: false }),
    [router, withCard],
  );
  const closeCard = useCallback(() => router.replace(withCard(null), { scroll: false }), [router, withCard]);

  const visible = useMemo(() => {
    if (!board.data) return null;
    const cards = allCards(board.data);
    const shown = new Set(filterCards(cards, filters, now).map((c) => c.id));
    const order: ColumnOrder = Object.fromEntries(
      board.data.columns.map((column) => [
        column.id,
        column.cards.filter((c) => shown.has(c.id)).map((c) => c.id),
      ]),
    );
    const cardsById = new Map<string, Card>(cards.map((c) => [c.id, c]));
    return { order, cardsById, shown: shown.size, total: cards.length };
  }, [board.data, filters, now]);

  // Checked before load errors: once access is gone, any refetch 404s too.
  if (realtime.revoked) {
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center" role="alert">
        <LockIcon className="text-muted-foreground mx-auto size-6" aria-hidden />
        <h1 className="text-lg font-semibold">You no longer have access to this board</h1>
        <p className="text-muted-foreground text-sm">You were removed from its workspace.</p>
        <Link href="/workspaces" className="text-primary text-sm underline underline-offset-4">
          Back to your workspaces
        </Link>
      </div>
    );
  }
  if (board.isError) {
    const missing = board.error instanceof ApiError && board.error.status === 404;
    return (
      <div className="mx-auto max-w-md space-y-2 p-10 text-center">
        <h1 className="text-lg font-semibold">{missing ? 'Board not found' : 'Couldn’t load this board'}</h1>
        <p className="text-muted-foreground text-sm">
          {missing ? 'It may have been deleted, or you don’t have access to it.' : 'Please try again.'}
        </p>
        <Link href="/workspaces" className="text-primary text-sm underline underline-offset-4">
          Back to your workspaces
        </Link>
      </div>
    );
  }
  if (!board.data || !visible || !context.ready) return <BoardSkeleton />;

  const readOnly = !context.permissions.canEditCards;

  return (
    <BoardProvider
      value={{
        board: board.data,
        permissions: context.permissions,
        members: context.members,
        mutations,
        now,
        openCard,
        meId,
        presence: realtime.presence,
        setEditing: realtime.setEditing,
      }}
    >
      <div className="flex h-[calc(100svh-3.5rem)] flex-col">
        <div className="space-y-3 border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1 text-sm">
              <Link href="/workspaces" className="hover:text-foreground">
                {context.workspaceName ?? 'Workspace'}
              </Link>
              <ChevronRightIcon className="size-3.5" aria-hidden />
            </nav>
            <h1 className="text-lg font-semibold tracking-tight">{board.data.name}</h1>
            {readOnly && (
              <Badge variant="outline" className="gap-1">
                <EyeIcon className="size-3" aria-hidden />
                View only
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-3">
              <BoardActivitySheet />
              <PresenceAvatars
                viewers={realtime.presence?.viewers ?? []}
                meId={meId}
                connected={realtime.connected}
              />
            </div>
          </div>
          <FilterToolbar
            filters={filters}
            onChange={setFilters}
            members={context.members}
            labels={boardLabels(board.data)}
            shown={visible.shown}
            total={visible.total}
          />
        </div>
        <div className="min-h-0 flex-1">
          <BoardDnd visibleOrder={visible.order} cardsById={visible.cardsById} />
        </div>
      </div>
      <CardDialog cardId={openCardId} onClose={closeCard} />
    </BoardProvider>
  );
}
