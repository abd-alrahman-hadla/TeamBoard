import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  boardRoom,
  can,
  editingSchema,
  type JoinBoardAck,
  joinBoardSchema,
  SOCKET_EVENTS,
  userRoom,
} from '@teamboard/shared';
import { WorkspaceResolver } from '../access/workspace-resolver.service';
import { TokenService } from '../auth/token.service';
import { type Env, InjectEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { BoardEventsService } from './board-events.service';
import type { BoardServer, BoardSocket } from './socket-data';

const NOT_FOUND: JoinBoardAck = { ok: false, code: 'not_found' };

/**
 * Realtime entry point. Clients authenticate with their access token (`auth: { token }`), join
 * one room per board they view (membership checked on every join), and receive `board:event`
 * and `presence:update` there. Writes never go through the socket: REST is the only write path.
 */
@WebSocketGateway()
export class BoardGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  /** Local timers only (not shared state): each instance disconnects its own sockets when their token expires. */
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly tokens: TokenService,
    private readonly resolver: WorkspaceResolver,
    private readonly prisma: PrismaService,
    private readonly events: BoardEventsService,
    @InjectEnv() private readonly env: Env,
  ) {}

  afterInit(server: BoardServer): void {
    this.events.attach(server);
    // Authenticate before the connection is accepted; a failure surfaces as connect_error "unauthorized".
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        (ok) => next(ok ? undefined : new Error('unauthorized')),
        () => next(new Error('unauthorized')),
      );
    });
  }

  private async authenticate(socket: BoardSocket): Promise<boolean> {
    const auth: unknown = socket.handshake.auth;
    const token = typeof auth === 'object' && auth !== null && 'token' in auth ? auth.token : undefined;
    if (typeof token !== 'string') return false;
    const verified = await this.tokens.verifyWithExpiry(token);
    if (!verified) return false;
    const user = await this.prisma.user.findUnique({ where: { id: verified.sub }, select: { name: true } });
    if (!user) return false;
    socket.data = { userId: verified.sub, name: user.name, boards: {}, editing: null };
    this.scheduleExpiry(socket, verified.expiresAt);
    return true;
  }

  /** At token expiry: tell the client (it reconnects with a fresh token) and drop the connection. */
  private scheduleExpiry(socket: BoardSocket, expiresAt: number): void {
    const timer = setTimeout(
      () => {
        socket.emit(SOCKET_EVENTS.expired);
        socket.disconnect(true);
      },
      Math.max(0, expiresAt - Date.now()),
    );
    timer.unref();
    this.expiryTimers.set(socket.id, timer);
  }

  async handleConnection(socket: BoardSocket): Promise<void> {
    await socket.join(userRoom(socket.data.userId));
    socket.emit(SOCKET_EVENTS.hello, { instanceId: this.env.INSTANCE_ID, userId: socket.data.userId });
  }

  async handleDisconnect(socket: BoardSocket): Promise<void> {
    clearTimeout(this.expiryTimers.get(socket.id));
    this.expiryTimers.delete(socket.id);
    // The socket has already left its rooms; recompute presence where it was.
    await Promise.all(Object.keys(socket.data.boards ?? {}).map((id) => this.events.broadcastPresence(id)));
  }

  @SubscribeMessage(SOCKET_EVENTS.join)
  async join(@ConnectedSocket() socket: BoardSocket, @MessageBody() body: unknown): Promise<JoinBoardAck> {
    const parsed = joinBoardSchema.safeParse(body);
    if (!parsed.success) return NOT_FOUND;
    const { boardId } = parsed.data;
    // Same rule as REST: unknown board and "not a member" look identical.
    const workspaceId = await this.resolver.workspaceOf('boardId', boardId);
    const role = workspaceId ? await this.resolver.roleOf(workspaceId, socket.data.userId) : null;
    if (!workspaceId || !role) return NOT_FOUND;

    await socket.join(boardRoom(boardId));
    socket.data.boards = { ...socket.data.boards, [boardId]: workspaceId };
    await this.events.broadcastPresence(boardId);
    return { ok: true };
  }

  @SubscribeMessage(SOCKET_EVENTS.leave)
  async leave(@ConnectedSocket() socket: BoardSocket, @MessageBody() body: unknown): Promise<void> {
    const parsed = joinBoardSchema.safeParse(body);
    if (!parsed.success) return;
    const { boardId } = parsed.data;
    await socket.leave(boardRoom(boardId));
    const { [boardId]: _left, ...rest } = socket.data.boards;
    socket.data.boards = rest;
    if (socket.data.editing?.boardId === boardId) socket.data.editing = null;
    await this.events.broadcastPresence(boardId);
  }

  /** "I have this card open". Only editors of a board they've joined; the card must be on that board. */
  @SubscribeMessage(SOCKET_EVENTS.editing)
  async editing(@ConnectedSocket() socket: BoardSocket, @MessageBody() body: unknown): Promise<void> {
    const parsed = editingSchema.safeParse(body);
    if (!parsed.success) return;
    const { boardId, cardId } = parsed.data;
    const workspaceId = socket.data.boards[boardId];
    if (!workspaceId || !socket.rooms.has(boardRoom(boardId))) return;

    if (cardId !== null) {
      // Role is re-read so a demotion takes effect immediately.
      const role = await this.resolver.roleOf(workspaceId, socket.data.userId);
      if (!role || !can(role, 'card.update')) return;
      const card = await this.prisma.card.findFirst({ where: { id: cardId, boardId }, select: { id: true } });
      if (!card) return;
    }
    socket.data.editing = cardId ? { boardId, cardId } : null;
    await this.events.broadcastPresence(boardId);
  }
}
