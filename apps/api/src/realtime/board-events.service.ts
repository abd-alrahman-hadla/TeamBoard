import { type BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { type BoardEvent, boardRoom, SOCKET_EVENTS, userRoom } from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { PrismaService } from '../prisma/prisma.service';
import { computePresence, type BoardServer } from './socket-data';

/** An event without the fields this service fills in. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type BoardEventInput = DistributiveOmit<BoardEvent, 'boardId' | 'actorId' | 'originClientId' | 'at'>;

/**
 * Publishes board events to `board:<id>` rooms (across instances via the Redis adapter).
 * Call it **after** the transaction has committed, never inside it: a rolled-back write must
 * never reach a client.
 */
@Injectable()
export class BoardEventsService implements BeforeApplicationShutdown {
  private readonly log = new Logger(BoardEventsService.name);
  private server: BoardServer | undefined;
  /** Set when the app starts shutting down: sockets are about to drop and Redis to close. */
  private closing = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs before Nest closes the socket server and the Redis clients. Disconnects during shutdown
   * would otherwise trigger presence lookups over an already-closed Redis connection.
   */
  beforeApplicationShutdown(): void {
    this.closing = true;
  }

  /** Called by the gateway once socket.io is up. */
  attach(server: BoardServer): void {
    this.server = server;
  }

  publish(boardId: string, access: Pick<AccessContext, 'userId' | 'clientId'>, event: BoardEventInput): void {
    const full = {
      ...event,
      boardId,
      actorId: access.userId,
      originClientId: access.clientId,
      at: new Date().toISOString(),
    };
    this.server?.to(boardRoom(boardId)).emit(SOCKET_EVENTS.event, full);
  }

  /** Sends `board.resync` to boards whose data changed in bulk (e.g. assignee pruning). */
  resync(boardIds: readonly string[], access: Pick<AccessContext, 'userId' | 'clientId'>): void {
    for (const boardId of new Set(boardIds))
      this.publish(boardId, access, { type: 'board.resync', payload: {} });
  }

  /**
   * The user lost access to a workspace: every socket of theirs (on any instance) leaves that
   * workspace's board rooms and is told why. Presence is refreshed for those boards.
   */
  async revoke(workspaceId: string, userId: string, boardIds?: readonly string[]): Promise<void> {
    if (!this.server) return;
    const ids =
      boardIds ??
      (await this.prisma.board.findMany({ where: { workspaceId }, select: { id: true } })).map((b) => b.id);
    const rooms = ids.map(boardRoom);
    if (rooms.length > 0) this.server.in(userRoom(userId)).socketsLeave(rooms);
    this.server.to(userRoom(userId)).emit(SOCKET_EVENTS.revoked, { workspaceId });
    await Promise.all(ids.map((id) => this.broadcastPresence(id)));
  }

  /** Board is gone: tell its viewers, then empty the room. */
  closeBoard(boardId: string, access: Pick<AccessContext, 'userId' | 'clientId'>): void {
    this.publish(boardId, access, { type: 'board.deleted', payload: {} });
    this.server?.in(boardRoom(boardId)).socketsLeave(boardRoom(boardId));
  }

  /** Recomputes who is on a board from the sockets in its room (all instances) and broadcasts it. */
  async broadcastPresence(boardId: string): Promise<void> {
    if (!this.server || this.closing) return;
    try {
      const sockets = await this.server.in(boardRoom(boardId)).fetchSockets();
      const presence = computePresence(
        boardId,
        sockets.map((s) => s.data),
      );
      this.server.to(boardRoom(boardId)).emit(SOCKET_EVENTS.presence, presence);
    } catch (error) {
      // fetchSockets times out if another instance doesn't answer; presence catches up on the next change.
      this.log.warn(`Presence for board ${boardId} failed: ${String(error)}`);
    }
  }
}
