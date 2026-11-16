import { Injectable } from '@nestjs/common';
import {
  type Notification,
  type NotificationPage,
  type NotificationQuery,
  parseMentions,
  SOCKET_EVENTS,
  stripMentions,
} from '@teamboard/shared';
import { notFound } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoardEventsService } from '../realtime/board-events.service';

const INCLUDE = { actor: { select: { id: true, name: true } } } as const;
type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof INCLUDE }>;

const EXCERPT_LENGTH = 140;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function toNotificationDto(row: NotificationRow): Notification {
  const data = typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data) ? row.data : {};
  return {
    id: row.id,
    type: row.type,
    actor: row.actor,
    workspaceId: row.workspaceId,
    boardId: row.boardId,
    cardId: row.cardId,
    commentId: row.commentId,
    cardTitle: str(data['cardTitle']),
    boardName: str(data['boardName']),
    excerpt: typeof data['excerpt'] === 'string' ? data['excerpt'] : null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function excerptOf(body: string): string {
  const plain = stripMentions(body).replace(/\s+/g, ' ').trim();
  return plain.length > EXCERPT_LENGTH ? `${plain.slice(0, EXCERPT_LENGTH - 1)}…` : plain;
}

/** A notification and who receives it (the DTO itself doesn't carry the recipient). */
export interface Delivery {
  userId: string;
  notification: Notification;
}

interface CardContext {
  workspaceId: string;
  boardId: string;
  boardName: string;
  cardId: string;
  cardTitle: string;
  actorId: string;
}

/**
 * Notifications are created inside the write's transaction (so they exist exactly when the
 * change does) and delivered to the recipient's `user:<id>` room after commit via `deliver()`.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BoardEventsService,
  ) {}

  /** Newly assigned users (excluding the actor) get an ASSIGNED notification. */
  async assigned(
    tx: Prisma.TransactionClient,
    ctx: CardContext,
    before: readonly string[],
    after: readonly string[],
  ): Promise<Delivery[]> {
    const recipients = after.filter((id) => !before.includes(id) && id !== ctx.actorId);
    return this.create(tx, ctx, 'ASSIGNED', recipients, null, null);
  }

  /**
   * Users newly mentioned in a comment (members of the workspace, not the actor) get a MENTIONED
   * notification. Editing a comment only notifies mentions that weren't there before.
   */
  async mentioned(
    tx: Prisma.TransactionClient,
    ctx: CardContext,
    comment: { id: string; body: string },
    previousBody: string | null,
  ): Promise<Delivery[]> {
    const before = previousBody ? parseMentions(previousBody) : [];
    const candidates = parseMentions(comment.body).filter((id) => !before.includes(id) && id !== ctx.actorId);
    if (candidates.length === 0) return [];
    const members = await tx.membership.findMany({
      where: { workspaceId: ctx.workspaceId, userId: { in: candidates } },
      select: { userId: true },
    });
    const allowed = new Set(members.map((m) => m.userId));
    return this.create(
      tx,
      ctx,
      'MENTIONED',
      candidates.filter((id) => allowed.has(id)),
      comment.id,
      excerptOf(comment.body),
    );
  }

  /** After commit: push each notification to its recipient's sockets (any instance). */
  deliver(deliveries: readonly Delivery[]): void {
    for (const { userId, notification } of deliveries) {
      this.events.toUser(userId, SOCKET_EVENTS.notification, notification);
    }
  }

  async list(userId: string, query: NotificationQuery): Promise<NotificationPage> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: INCLUDE,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit).map(toNotificationDto);
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  /** Someone else's (or an unknown) id is a 404, never a hint that it exists. */
  async markRead(userId: string, id: string): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) throw notFound();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  private async create(
    tx: Prisma.TransactionClient,
    ctx: CardContext,
    type: 'ASSIGNED' | 'MENTIONED',
    recipients: readonly string[],
    commentId: string | null,
    excerpt: string | null,
  ): Promise<Delivery[]> {
    const created: Delivery[] = [];
    for (const userId of recipients) {
      const row = await tx.notification.create({
        data: {
          userId,
          workspaceId: ctx.workspaceId,
          boardId: ctx.boardId,
          cardId: ctx.cardId,
          commentId,
          actorId: ctx.actorId,
          type,
          data: { cardTitle: ctx.cardTitle, boardName: ctx.boardName, ...(excerpt ? { excerpt } : {}) },
        },
        include: INCLUDE,
      });
      created.push({ userId, notification: toNotificationDto(row) });
    }
    return created;
  }
}
