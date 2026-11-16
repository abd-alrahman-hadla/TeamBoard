'use client';

import {
  type BoardDetail,
  type BoardEvent,
  boardEventSchema,
  type Comment,
  type JoinBoardAck,
  type Presence,
  presenceSchema,
  SOCKET_EVENTS,
} from '@teamboard/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getClientId } from '@/lib/client-id';
import { type BoardSocket, connectSocket } from '@/lib/socket';
import { queryKeys } from '../query-keys';
import { applyBoardEvent, applyCommentEvent, isBoardCacheEvent } from './apply-board-event';

export interface BoardRealtime {
  presence: Presence | null;
  /** null until the first connection, then whether the socket is currently connected. */
  connected: boolean | null;
  /** Access to this board's workspace was removed while viewing it. */
  revoked: boolean;
  /** Tell others which card this tab has open (null when closed). */
  setEditing: (cardId: string | null) => void;
}

/**
 * Live updates for one board: joins its room, applies other tabs' changes to the TanStack Query
 * cache (skipping this tab's own echoes), tracks presence, and refetches the board after every
 * (re)join so changes missed while disconnected show up.
 */
export function useBoardRealtime(
  boardId: string,
  workspaceId: string | undefined,
  enabled: boolean,
): BoardRealtime {
  const queryClient = useQueryClient();
  const router = useRouter();
  // In a ref so a new router object never re-subscribes (leave + rejoin) the board.
  const routerRef = useRef(router);
  routerRef.current = router;
  const [socket, setSocket] = useState<BoardSocket | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const live = connectSocket();
    setSocket(live);
    const boardKey = queryKeys.board(boardId);

    const join = () => {
      live.emit(SOCKET_EVENTS.join, { boardId }, (ack: JoinBoardAck) => {
        if (!ack.ok) {
          setRevoked(true);
          return;
        }
        // Catch up on anything missed before (or while not) being in the room.
        void queryClient.invalidateQueries({ queryKey: boardKey });
      });
    };

    const onConnect = () => {
      setConnected(true);
      join();
    };
    const onDisconnect = () => {
      setConnected(false);
      setPresence(null);
    };

    const onEvent = (raw: BoardEvent) => {
      const parsed = boardEventSchema.safeParse(raw);
      if (!parsed.success || parsed.data.boardId !== boardId) return;
      const event = parsed.data;
      if (event.originClientId === getClientId()) return; // our own change, already applied optimistically

      if (isBoardCacheEvent(event)) {
        queryClient.setQueryData<BoardDetail>(boardKey, (board) =>
          board ? applyBoardEvent(board, event) : board,
        );
        const cardId =
          'card' in event.payload
            ? event.payload.card.id
            : 'cardId' in event.payload
              ? event.payload.cardId
              : null;
        if (cardId) void queryClient.invalidateQueries({ queryKey: queryKeys.cardActivity(cardId) });
        return;
      }
      switch (event.type) {
        case 'comment.created':
        case 'comment.updated':
        case 'comment.deleted': {
          const cardId =
            event.type === 'comment.deleted' ? event.payload.cardId : event.payload.comment.cardId;
          queryClient.setQueryData<Comment[]>(queryKeys.comments(cardId), (list) =>
            list ? applyCommentEvent(list, event) : list,
          );
          void queryClient.invalidateQueries({ queryKey: queryKeys.cardActivity(cardId) });
          return;
        }
        case 'board.resync':
          void queryClient.invalidateQueries({ queryKey: boardKey });
          return;
        case 'board.deleted':
          toast.info('This board was deleted.');
          routerRef.current.replace('/workspaces');
          return;
      }
    };

    const onPresence = (raw: Presence) => {
      const parsed = presenceSchema.safeParse(raw);
      if (parsed.success && parsed.data.boardId === boardId) setPresence(parsed.data);
    };

    const onRevoked = ({ workspaceId: lost }: { workspaceId: string }) => {
      if (lost === workspaceId) setRevoked(true);
    };

    live.on('connect', onConnect);
    live.on('disconnect', onDisconnect);
    live.on(SOCKET_EVENTS.event, onEvent);
    live.on(SOCKET_EVENTS.presence, onPresence);
    live.on(SOCKET_EVENTS.revoked, onRevoked);
    if (live.connected) onConnect();

    return () => {
      live.emit(SOCKET_EVENTS.leave, { boardId });
      live.off('connect', onConnect);
      live.off('disconnect', onDisconnect);
      live.off(SOCKET_EVENTS.event, onEvent);
      live.off(SOCKET_EVENTS.presence, onPresence);
      live.off(SOCKET_EVENTS.revoked, onRevoked);
    };
  }, [boardId, workspaceId, enabled, queryClient]);

  const setEditing = useCallback(
    (cardId: string | null) => socket?.emit(SOCKET_EVENTS.editing, { boardId, cardId }),
    [socket, boardId],
  );

  return { presence, connected, revoked, setEditing };
}
