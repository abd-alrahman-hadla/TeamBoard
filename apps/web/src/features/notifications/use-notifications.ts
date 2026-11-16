'use client';

import {
  describeNotification,
  type Notification,
  type NotificationPage,
  notificationPageSchema,
  notificationSchema,
  SOCKET_EVENTS,
  unreadCountSchema,
} from '@teamboard/shared';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { apiJson, apiVoid } from '@/lib/api-client';
import { connectSocket } from '@/lib/socket';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => ['notifications', 'list'] as const,
  unread: () => ['notifications', 'unread'] as const,
};

const listNotifications = (cursor?: string): Promise<NotificationPage> =>
  apiJson(`/notifications${cursor ? `?cursor=${cursor}` : ''}`, notificationPageSchema);
const unreadCount = () => apiJson('/notifications/unread-count', unreadCountSchema);

/** Where a notification leads: its card, opened on its board. */
export function notificationHref(notification: Notification): string | null {
  if (!notification.boardId) return null;
  return notification.cardId
    ? `/b/${notification.boardId}?card=${notification.cardId}`
    : `/b/${notification.boardId}`;
}

export function useUnreadCount() {
  return useQuery({ queryKey: notificationKeys.unread(), queryFn: unreadCount });
}

export function useNotificationList(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ pageParam }) => listNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

type ListData = InfiniteData<NotificationPage, string | undefined>;

/** Mark one read: optimistic (dot disappears, count drops), corrected by a refetch. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiVoid(`/notifications/${id}/read`, { method: 'POST' }),
    onMutate: (id) => {
      const readAt = new Date().toISOString();
      let changed = false;
      queryClient.setQueryData<ListData>(notificationKeys.list(), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((n) => {
                  if (n.id !== id || n.readAt) return n;
                  changed = true;
                  return { ...n, readAt };
                }),
              })),
            }
          : data,
      );
      if (changed) {
        queryClient.setQueryData<{ count: number }>(notificationKeys.unread(), (c) =>
          c ? { count: Math.max(0, c.count - 1) } : c,
        );
      }
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiVoid('/notifications/read-all', { method: 'POST' }),
    onMutate: () => queryClient.setQueryData(notificationKeys.unread(), { count: 0 }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/**
 * Live delivery: new notifications arrive on the socket (connected app-wide here). They bump the
 * unread count, refresh the list and pop a toast with a link. On reconnect, recount (missed ones).
 */
export function useLiveNotifications(): void {
  const queryClient = useQueryClient();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const socket = connectSocket();
    let connectedBefore = socket.connected;

    const onNotification = (raw: Notification) => {
      const parsed = notificationSchema.safeParse(raw);
      if (!parsed.success) return;
      const notification = parsed.data;
      queryClient.setQueryData<{ count: number }>(notificationKeys.unread(), (c) => ({
        count: (c?.count ?? 0) + 1,
      }));
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
      const href = notificationHref(notification);
      toast(describeNotification(notification), {
        ...(notification.excerpt ? { description: notification.excerpt } : {}),
        ...(href ? { action: { label: 'Open', onClick: () => routerRef.current.push(href) } } : {}),
      });
    };
    const onConnect = () => {
      if (connectedBefore) void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      connectedBefore = true;
    };

    socket.on(SOCKET_EVENTS.notification, onNotification);
    socket.on('connect', onConnect);
    return () => {
      socket.off(SOCKET_EVENTS.notification, onNotification);
      socket.off('connect', onConnect);
    };
  }, [queryClient]);
}
