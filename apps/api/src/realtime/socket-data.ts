import type { ClientToServerEvents, Presence, ServerToClientEvents } from '@teamboard/shared';
import type { Server, Socket } from 'socket.io';

/**
 * Per-socket state. It must stay plain JSON: with the Redis adapter, fetchSockets() ships it
 * between instances, which is how presence works without any shared store.
 */
export interface SocketData {
  userId: string;
  name: string;
  /** Boards this socket joined, with their workspace. */
  boards: Record<string, string>;
  /** The card this socket has open for editing. */
  editing: { boardId: string; cardId: string } | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no server-to-server events
type InterServerEvents = {};

export type BoardServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type BoardSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Presence for one board from the data of the sockets in its room (one entry per user). */
export function computePresence(
  boardId: string,
  sockets: readonly Pick<SocketData, 'userId' | 'name' | 'editing'>[],
): Presence {
  const viewers = new Map<string, string>();
  const editing: Record<string, string[]> = {};
  for (const socket of sockets) {
    viewers.set(socket.userId, socket.name);
    if (socket.editing?.boardId === boardId) {
      const users = (editing[socket.editing.cardId] ??= []);
      if (!users.includes(socket.userId)) users.push(socket.userId);
    }
  }
  return {
    boardId,
    viewers: [...viewers]
      .map(([userId, name]) => ({ userId, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    editing,
  };
}
