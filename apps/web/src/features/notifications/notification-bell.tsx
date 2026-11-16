'use client';

import { describeNotification, type Notification } from '@teamboard/shared';
import { AtSignIcon, BellIcon, UserPlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { timeAgo } from '@/features/boards/due-date';
import { cn } from '@/lib/utils';
import {
  notificationHref,
  useLiveNotifications,
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
} from './use-notifications';

export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function NotificationItem({ notification, onOpen }: { notification: Notification; onOpen: () => void }) {
  const unread = notification.readAt === null;
  const Icon = notification.type === 'ASSIGNED' ? UserPlusIcon : AtSignIcon;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'hover:bg-accent flex w-full gap-3 rounded-md px-3 py-2 text-left',
          unread && 'bg-primary/5',
        )}
        data-testid="notification"
        data-unread={unread}
      >
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className={cn('block text-sm', unread && 'font-medium')}>
            {describeNotification(notification)}
          </span>
          {notification.excerpt && (
            <span className="text-muted-foreground block truncate text-xs">“{notification.excerpt}”</span>
          )}
          <span className="text-muted-foreground block text-xs">
            {notification.boardName} · {timeAgo(notification.createdAt, new Date())}
          </span>
        </span>
        {unread && <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" aria-label="Unread" />}
      </button>
    </li>
  );
}

/** Header bell: unread count, the list in a popover, live updates over the socket. */
export function NotificationBell() {
  useLiveNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const unread = useUnreadCount();
  const list = useNotificationList(open);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const count = unread.data?.count ?? 0;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  const openNotification = (notification: Notification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    const href = notificationHref(notification);
    setOpen(false);
    if (href) router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        >
          <BellIcon aria-hidden />
          {count > 0 && (
            <span
              className="bg-destructive absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white tabular-nums"
              data-testid="unread-badge"
            >
              {badgeText(count)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={count === 0}
            onClick={() => markAllRead.mutate()}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {list.isPending && <Skeleton className="m-2 h-14" />}
          {list.isError && <p className="text-destructive p-3 text-sm">Couldn’t load notifications.</p>}
          {list.isSuccess && items.length === 0 && (
            <p className="text-muted-foreground p-6 text-center text-sm">You’re all caught up.</p>
          )}
          <ul aria-label="Notifications">
            {items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onOpen={() => openNotification(notification)}
              />
            ))}
          </ul>
          {list.hasNextPage && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void list.fetchNextPage()}>
              Load more
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
