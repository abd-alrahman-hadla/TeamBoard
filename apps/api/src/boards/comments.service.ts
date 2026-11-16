import { Injectable } from '@nestjs/common';
import {
  canDeleteComment,
  canEditComment,
  type Comment,
  type CreateCommentInput,
  type UpdateCommentInput,
} from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { ActivityService } from '../activity/activity.service';
import { forbidden, notFound } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BoardEventsService } from '../realtime/board-events.service';
import { toCommentDto } from './board.mappers';

const COMMENT_INCLUDE = { author: { select: { id: true, name: true } } } as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly events: BoardEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(access: AccessContext, cardId: string): Promise<Comment[]> {
    await this.findCard(this.prisma, access, cardId);
    const rows = await this.prisma.comment.findMany({
      where: { cardId },
      include: COMMENT_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return rows.map(toCommentDto);
  }

  async create(access: AccessContext, cardId: string, input: CreateCommentInput): Promise<Comment> {
    const { comment, boardId, deliveries } = await this.prisma.$transaction(async (tx) => {
      const card = await this.findCard(tx, access, cardId);
      const comment = await tx.comment.create({
        data: { cardId: card.id, authorId: access.userId, body: input.body },
        include: COMMENT_INCLUDE,
      });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: card.boardId,
        actorId: access.userId,
        entityType: 'comment',
        entityId: comment.id,
        action: 'comment.created',
        data: { cardId: card.id, cardTitle: card.title },
      });
      const deliveries = await this.notifications.mentioned(
        tx,
        {
          workspaceId: access.workspaceId,
          boardId: card.boardId,
          boardName: card.board.name,
          cardId: card.id,
          cardTitle: card.title,
          actorId: access.userId,
        },
        { id: comment.id, body: comment.body },
        null,
      );
      return { comment: toCommentDto(comment), boardId: card.boardId, deliveries };
    });
    this.events.publish(boardId, access, { type: 'comment.created', payload: { comment } });
    this.notifications.deliver(deliveries);
    return comment;
  }

  /** Only the author edits. */
  async update(access: AccessContext, commentId: string, input: UpdateCommentInput): Promise<Comment> {
    const { comment, boardId, deliveries } = await this.prisma.$transaction(async (tx) => {
      const current = await this.findScoped(tx, access, commentId);
      if (!canEditComment(access.userId, current.authorId))
        throw forbidden('Only the author can edit a comment');
      const comment = await tx.comment.update({
        where: { id: current.id },
        data: { body: input.body },
        include: COMMENT_INCLUDE,
      });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: current.card.boardId,
        actorId: access.userId,
        entityType: 'comment',
        entityId: comment.id,
        action: 'comment.updated',
        data: { cardId: comment.cardId, cardTitle: current.card.title },
      });
      const deliveries = await this.notifications.mentioned(
        tx,
        {
          workspaceId: access.workspaceId,
          boardId: current.card.boardId,
          boardName: current.card.board.name,
          cardId: current.cardId,
          cardTitle: current.card.title,
          actorId: access.userId,
        },
        { id: comment.id, body: comment.body },
        current.body,
      );
      return { comment: toCommentDto(comment), boardId: current.card.boardId, deliveries };
    });
    this.events.publish(boardId, access, { type: 'comment.updated', payload: { comment } });
    this.notifications.deliver(deliveries);
    return comment;
  }

  /** The author, or an admin+, deletes. */
  async delete(access: AccessContext, commentId: string): Promise<void> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const current = await this.findScoped(tx, access, commentId);
      if (!canDeleteComment(access.userId, access.role, current.authorId)) {
        throw forbidden('Only the author or an admin can delete a comment');
      }
      await tx.comment.delete({ where: { id: current.id } });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: current.card.boardId,
        actorId: access.userId,
        entityType: 'comment',
        entityId: current.id,
        action: 'comment.deleted',
        data: { cardId: current.cardId, cardTitle: current.card.title },
      });
      return current;
    });
    this.events.publish(deleted.card.boardId, access, {
      type: 'comment.deleted',
      payload: { commentId: deleted.id, cardId: deleted.cardId },
    });
  }

  private async findCard(tx: Prisma.TransactionClient, access: AccessContext, cardId: string) {
    const card = await tx.card.findFirst({
      where: { id: cardId, board: { workspaceId: access.workspaceId } },
      select: { id: true, boardId: true, title: true, board: { select: { name: true } } },
    });
    if (!card) throw notFound();
    return card;
  }

  private async findScoped(tx: Prisma.TransactionClient, access: AccessContext, commentId: string) {
    const comment = await tx.comment.findFirst({
      where: { id: commentId, card: { board: { workspaceId: access.workspaceId } } },
      include: { card: { select: { boardId: true, title: true, board: { select: { name: true } } } } },
    });
    if (!comment) throw notFound();
    return comment;
  }
}
