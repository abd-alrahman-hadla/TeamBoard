'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cardActivity } from '../board-api';
import { timeAgo } from '../due-date';
import { queryKeys } from '../query-keys';
import { describeActivity } from './describe-activity';

interface ActivityPanelProps {
  cardId: string;
  columnName: (id: string) => string | undefined;
  now: Date;
}

/** The card's history, newest first, paged with the API's cursor. */
export function ActivityPanel({ cardId, columnName, now }: ActivityPanelProps) {
  const activity = useInfiniteQuery({
    queryKey: queryKeys.cardActivity(cardId),
    queryFn: ({ pageParam }) => cardActivity(cardId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  if (activity.isPending) return <Skeleton className="h-24 w-full" />;
  if (activity.isError) return <p className="text-destructive text-sm">Couldn’t load the history.</p>;

  const entries = activity.data.pages.flatMap((page) => page.items);
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">No history yet.</p>;

  return (
    <div className="space-y-3">
      <ol className="space-y-2" aria-label="Card history">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-baseline gap-2 text-sm" data-testid="activity-entry">
            <span className="flex-1">{describeActivity(entry, columnName)}</span>
            <time className="text-muted-foreground shrink-0 text-xs" dateTime={entry.createdAt}>
              {timeAgo(entry.createdAt, now)}
            </time>
          </li>
        ))}
      </ol>
      {activity.hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void activity.fetchNextPage()}
          disabled={activity.isFetchingNextPage}
        >
          {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
