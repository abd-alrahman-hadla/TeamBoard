import { Injectable } from '@nestjs/common';
import type { Card, CreateCardInput, MoveCardInput, UpdateCardInput } from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';
import {
  assertNotSelfAnchor,
  lockColumnForPlacement,
  placementFrom,
  positionFor,
  type SiblingQueries,
  withPositionRetry,
} from '../ordering/placement';
import { PrismaService } from '../prisma/prisma.service';
import { BoardEventsService } from '../realtime/board-events.service';
import { MembersService } from '../workspaces/members.service';
import { toCardDto } from './board.mappers';

const POSITION = { position: true } as const;

/** A column's cards, excluding `excludeId` (the card being moved). */
function cardSiblings(tx: Prisma.TransactionClient, columnId: string, excludeId?: string): SiblingQueries {
  const scope = { columnId, ...(excludeId ? { id: { not: excludeId } } : {}) };
  return {
    find: (id) => tx.card.findFirst({ where: { ...scope, id }, select: POSITION }),
    firstAfter: (position) =>
      tx.card.findFirst({
        where: { ...scope, ...(position !== null ? { position: { gt: position } } : {}) },
        orderBy: { position: 'asc' },
        select: POSITION,
      }),
    last: () => tx.card.findFirst({ where: scope, orderBy: { position: 'desc' }, select: POSITION }),
  };
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly members: MembersService,
    private readonly events: BoardEventsService,
  ) {}

  async create(access: AccessContext, columnId: string, input: CreateCardInput): Promise<Card> {
    const placement = placementFrom(input.afterId);
    const card = await withPositionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const column = await tx.column.findFirst({
          where: { id: columnId, board: { workspaceId: access.workspaceId } },
          select: { id: true, boardId: true, name: true },
        });
        if (!column) throw notFound();
        await lockColumnForPlacement(tx, column.id);
        const assigneeIds = input.assigneeIds ?? [];
        await this.members.assertMembers(tx, access.workspaceId, assigneeIds);

        const position = await positionFor(cardSiblings(tx, column.id), placement);
        const card = await tx.card.create({
          data: {
            boardId: column.boardId,
            columnId: column.id,
            title: input.title,
            description: input.description ?? null,
            labels: input.labels ?? [],
            dueDate: toDate(input.dueDate ?? null),
            assigneeIds,
            position,
            createdById: access.userId,
          },
        });
        await this.activity.record(tx, {
          workspaceId: access.workspaceId,
          boardId: card.boardId,
          actorId: access.userId,
          entityType: 'card',
          entityId: card.id,
          action: 'card.created',
          data: { cardTitle: card.title, columnId: card.columnId, columnName: column.name },
        });
        return toCardDto(card);
      }),
    );
    this.events.publish(card.boardId, access, { type: 'card.created', payload: { card } });
    return card;
  }

  async get(access: AccessContext, cardId: string): Promise<Card> {
    return toCardDto(await this.findScoped(this.prisma, access, cardId));
  }

  async update(access: AccessContext, cardId: string, input: UpdateCardInput): Promise<Card> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await this.findScoped(tx, access, cardId);
      if (input.assigneeIds) await this.members.assertMembers(tx, access.workspaceId, input.assigneeIds);
      const card = await tx.card.update({
        where: { id: current.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.labels !== undefined ? { labels: input.labels } : {}),
          ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) } : {}),
          ...(input.assigneeIds !== undefined ? { assigneeIds: input.assigneeIds } : {}),
          version: { increment: 1 },
        },
      });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: card.boardId,
        actorId: access.userId,
        entityType: 'card',
        entityId: card.id,
        action: 'card.updated',
        data: {
          fields: Object.keys(input),
          cardTitle: card.title,
          ...(card.title !== current.title ? { previousTitle: current.title } : {}),
        },
      });
      return toCardDto(card);
    });
    this.events.publish(updated.boardId, access, { type: 'card.updated', payload: { card: updated } });
    return updated;
  }

  /**
   * Moves a card within its board. The target column must be on the same board and the anchor
   * in the target column; anything else is a 404. Writes only the moved card's row.
   */
  async move(access: AccessContext, cardId: string, input: MoveCardInput): Promise<Card> {
    const placement = placementFrom(input.afterId);
    assertNotSelfAnchor(cardId, placement);
    const { card, fromColumnId } = await withPositionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.findScoped(tx, access, cardId);
        const target = await tx.column.findFirst({
          where: { id: input.columnId, boardId: current.boardId },
          select: { id: true, name: true },
        });
        if (!target) throw notFound();
        await lockColumnForPlacement(tx, target.id);

        const position = await positionFor(cardSiblings(tx, target.id, current.id), placement);
        const card = await tx.card.update({
          where: { id: current.id },
          data: { columnId: target.id, position, version: { increment: 1 } },
        });
        await this.activity.record(tx, {
          workspaceId: access.workspaceId,
          boardId: card.boardId,
          actorId: access.userId,
          entityType: 'card',
          entityId: card.id,
          action: 'card.moved',
          data: {
            cardTitle: card.title,
            fromColumnId: current.columnId,
            fromColumnName: current.column.name,
            toColumnId: target.id,
            toColumnName: target.name,
            afterId: input.afterId,
          },
        });
        return { card: toCardDto(card), fromColumnId: current.columnId };
      }),
    );
    this.events.publish(card.boardId, access, { type: 'card.moved', payload: { card, fromColumnId } });
    return card;
  }

  async delete(access: AccessContext, cardId: string): Promise<void> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const current = await this.findScoped(tx, access, cardId);
      await tx.card.delete({ where: { id: current.id } });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: current.boardId,
        actorId: access.userId,
        entityType: 'card',
        entityId: current.id,
        action: 'card.deleted',
        data: { cardTitle: current.title, columnId: current.columnId },
      });
      return current;
    });
    this.events.publish(deleted.boardId, access, {
      type: 'card.deleted',
      payload: { cardId: deleted.id, columnId: deleted.columnId },
    });
  }

  private async findScoped(tx: Prisma.TransactionClient, access: AccessContext, cardId: string) {
    const card = await tx.card.findFirst({
      where: { id: cardId, board: { workspaceId: access.workspaceId } },
      include: { column: { select: { name: true } } },
    });
    if (!card) throw notFound();
    return card;
  }
}
