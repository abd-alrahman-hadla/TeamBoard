'use client';

import { type Activity, activityCardId, describeActivity } from '@teamboard/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { HistoryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoardContextValue } from '../board-context';
import { findCard } from '../board-cache';
import { boardActivity } from '../board-api';
import { timeAgo } from '../due-date';
import { queryKeys } from '../query-keys';

/** "Today", "Yesterday", or the date. */
export function dayLabel(iso: string, now: Date): string {
  const day = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(day)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Consecutive entries grouped under their day heading (entries arrive newest first). */
export function groupByDay(entries: Activity[], now: Date): { day: string; entries: Activity[] }[] {
  const groups: { day: string; entries: Activity[] }[] = [];
  for (const entry of entries) {
    const day = dayLabel(entry.createdAt, now);
    const last = groups.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

function ActivityFeed() {
  const { board, now, openCard } = useBoardContextValue();
  const activity = useInfiniteQuery({
    queryKey: queryKeys.boardActivity(board.id),
    queryFn: ({ pageParam }) => boardActivity(board.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  if (activity.isPending) return <Skeleton className="h-40 w-full" />;
  if (activity.isError) return <p className="text-destructive text-sm">Couldn’t load the activity.</p>;
  const entries = activity.data.pages.flatMap((page) => page.items);
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>;

  const lookup = {
    columnName: (id: string) => board.columns.find((c) => c.id === id)?.name,
    cardTitle: (id: string) => findCard(board, id)?.title,
  };

  return (
    <div className="space-y-5">
      {groupByDay(entries, now).map((group) => (
        <section key={group.day} aria-label={group.day}>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            {group.day}
          </h3>
          <ol className="space-y-2">
            {group.entries.map((entry) => {
              const cardId = activityCardId(entry);
              const openable = cardId !== undefined && findCard(board, cardId) !== undefined;
              const sentence = describeActivity(entry, 'board', lookup);
              return (
                <li
                  key={entry.id}
                  className="flex items-baseline gap-2 text-sm"
                  data-testid="board-activity-entry"
                >
                  {openable ? (
                    <button
                      type="button"
                      className="hover:text-primary flex-1 text-left underline-offset-2 hover:underline"
                      onClick={() => openCard(cardId)}
                    >
                      {sentence}
                    </button>
                  ) : (
                    <span className="flex-1">{sentence}</span>
                  )}
                  <time className="text-muted-foreground shrink-0 text-xs" dateTime={entry.createdAt}>
                    {timeAgo(entry.createdAt, now)}
                  </time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
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

/** Board-wide activity log in a side drawer. Live: realtime events invalidate it. */
export function BoardActivitySheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <HistoryIcon aria-hidden />
          Activity
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Activity</SheetTitle>
          <SheetDescription>Everything that happened on this board, newest first.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <ActivityFeed />
        </div>
      </SheetContent>
    </Sheet>
  );
}
