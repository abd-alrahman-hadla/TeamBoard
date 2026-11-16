import { z } from 'zod';
import { boardSchema, cardSchema, columnSchema, commentSchema } from './schemas/board';
import { idSchema, timestampSchema } from './schemas/common';

/** Socket.io event names (the wire contract between apps/api and apps/web). */
export const SOCKET_EVENTS = {
  /** client → server, with ack: start receiving a board's events. */
  join: 'board:join',
  /** client → server */
  leave: 'board:leave',
  /** client → server: which card this socket has open for editing (null = none). */
  editing: 'card:editing',
  /** server → client: something changed on a board. */
  event: 'board:event',
  /** server → client: who is viewing / editing a board. */
  presence: 'presence:update',
  /** server → client: you lost access to a workspace; its boards' events stop. */
  revoked: 'access:revoked',
  /** server → client: your access token expired; reconnect with a fresh one. */
  expired: 'auth:expired',
  /** server → client, on connect. */
  hello: 'hello',
} as const;

/** Header the web app sends on every request so its own changes can be recognised in events. */
export const CLIENT_ID_HEADER = 'x-client-id';
export const clientIdSchema = z.string().regex(/^[\w-]{1,64}$/);

export const boardRoom = (boardId: string) => `board:${boardId}`;
export const userRoom = (userId: string) => `user:${userId}`;

const envelope = {
  boardId: idSchema,
  /** Who made the change. */
  actorId: idSchema,
  /** The X-Client-Id of the request that made the change (null for server-initiated changes). */
  originClientId: z.string().nullable(),
  at: timestampSchema,
};

const event = <T extends string, P extends z.ZodRawShape>(type: T, payload: P) =>
  z.object({ type: z.literal(type), ...envelope, payload: z.object(payload) });

export const boardEventSchema = z.discriminatedUnion('type', [
  event('card.created', { card: cardSchema }),
  event('card.updated', { card: cardSchema }),
  event('card.moved', { card: cardSchema, fromColumnId: idSchema }),
  event('card.deleted', { cardId: idSchema, columnId: idSchema }),
  event('column.created', { column: columnSchema }),
  event('column.updated', { column: columnSchema }),
  event('column.moved', { column: columnSchema }),
  event('column.deleted', { columnId: idSchema }),
  event('comment.created', { comment: commentSchema }),
  event('comment.updated', { comment: commentSchema }),
  event('comment.deleted', { commentId: idSchema, cardId: idSchema }),
  event('board.updated', { board: boardSchema }),
  event('board.deleted', {}),
  /** Many entities changed at once (e.g. a member was unassigned everywhere): refetch the board. */
  event('board.resync', {}),
]);

export type BoardEvent = z.infer<typeof boardEventSchema>;
export type BoardEventType = BoardEvent['type'];
export type BoardEventOf<T extends BoardEventType> = Extract<BoardEvent, { type: T }>;
export const BOARD_EVENT_TYPES = boardEventSchema.options.map<BoardEventType>((o) => o.shape.type.value);

export const presenceViewerSchema = z.object({ userId: idSchema, name: z.string() });

export const presenceSchema = z.object({
  boardId: idSchema,
  /** Distinct users with the board open (a user with two tabs appears once). */
  viewers: z.array(presenceViewerSchema),
  /** cardId → users who have that card open for editing. */
  editing: z.record(z.string(), z.array(idSchema)),
});

export type PresenceViewer = z.infer<typeof presenceViewerSchema>;
export type Presence = z.infer<typeof presenceSchema>;

export const joinBoardSchema = z.object({ boardId: idSchema });
export const editingSchema = z.object({ boardId: idSchema, cardId: idSchema.nullable() });

export type JoinBoardAck = { ok: true } | { ok: false; code: 'not_found' };

export interface HelloPayload {
  instanceId: string;
  userId: string;
}

export interface ServerToClientEvents {
  'board:event': (event: BoardEvent) => void;
  'presence:update': (presence: Presence) => void;
  'access:revoked': (payload: { workspaceId: string }) => void;
  'auth:expired': () => void;
  hello: (payload: HelloPayload) => void;
}

export interface ClientToServerEvents {
  'board:join': (payload: z.infer<typeof joinBoardSchema>, ack: (result: JoinBoardAck) => void) => void;
  'board:leave': (payload: z.infer<typeof joinBoardSchema>) => void;
  'card:editing': (payload: z.infer<typeof editingSchema>) => void;
}
