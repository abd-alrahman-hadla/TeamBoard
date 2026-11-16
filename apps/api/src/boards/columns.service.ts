import { Injectable } from '@nestjs/common';
import type { Column, CreateColumnInput, MoveColumnInput, UpdateColumnInput } from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';
import {
  assertNotSelfAnchor,
  lockBoardForPlacement,
  type Placement,
  placementFrom,
  positionFor,
  type SiblingQueries,
  withPositionRetry,
} from '../ordering/placement';
import { PrismaService } from '../prisma/prisma.service';
import { BoardEventsService } from '../realtime/board-events.service';
import { toColumnDto } from './board.mappers';

const POSITION = { position: true } as const;

/** A board's columns, excluding `excludeId` (the column being moved). */
function columnSiblings(tx: Prisma.TransactionClient, boardId: string, excludeId?: string): SiblingQueries {
  const scope = { boardId, ...(excludeId ? { id: { not: excludeId } } : {}) };
  return {
    find: (id) => tx.column.findFirst({ where: { ...scope, id }, select: POSITION }),
    firstAfter: (position) =>
      tx.column.findFirst({
        where: { ...scope, ...(position !== null ? { position: { gt: position } } : {}) },
        orderBy: { position: 'asc' },
        select: POSITION,
      }),
    last: () => tx.column.findFirst({ where: scope, orderBy: { position: 'desc' }, select: POSITION }),
  };
}

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly events: BoardEventsService,
  ) {}

  async create(access: AccessContext, boardId: string, input: CreateColumnInput): Promise<Column> {
    const placement = placementFrom(input.afterId);
    const column = await withPositionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const board = await tx.board.findFirst({ where: { id: boardId, workspaceId: access.workspaceId } });
        if (!board) throw notFound();
        await lockBoardForPlacement(tx, boardId);
        const position = await positionFor(columnSiblings(tx, boardId), placement);
        const column = await tx.column.create({ data: { boardId, name: input.name, position } });
        await this.activity.record(tx, {
          workspaceId: access.workspaceId,
          boardId,
          actorId: access.userId,
          entityType: 'column',
          entityId: column.id,
          action: 'column.created',
          data: { name: column.name },
        });
        return toColumnDto(column);
      }),
    );
    this.events.publish(boardId, access, { type: 'column.created', payload: { column } });
    return column;
  }

  async update(access: AccessContext, columnId: string, input: UpdateColumnInput): Promise<Column> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await this.findScoped(tx, access, columnId);
      const column = await tx.column.update({
        where: { id: current.id },
        data: { name: input.name, version: { increment: 1 } },
      });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: column.boardId,
        actorId: access.userId,
        entityType: 'column',
        entityId: column.id,
        action: 'column.updated',
        data: { name: column.name, ...(column.name !== current.name ? { previousName: current.name } : {}) },
      });
      return toColumnDto(column);
    });
    this.events.publish(updated.boardId, access, { type: 'column.updated', payload: { column: updated } });
    return updated;
  }

  /** Writes only the moved column's row (new fractional key + version). */
  async move(access: AccessContext, columnId: string, input: MoveColumnInput): Promise<Column> {
    const placement: Placement = placementFrom(input.afterId);
    assertNotSelfAnchor(columnId, placement);
    const column = await withPositionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.findScoped(tx, access, columnId);
        await lockBoardForPlacement(tx, current.boardId);
        const position = await positionFor(columnSiblings(tx, current.boardId, current.id), placement);
        const column = await tx.column.update({
          where: { id: current.id },
          data: { position, version: { increment: 1 } },
        });
        await this.activity.record(tx, {
          workspaceId: access.workspaceId,
          boardId: column.boardId,
          actorId: access.userId,
          entityType: 'column',
          entityId: column.id,
          action: 'column.moved',
          data: { name: column.name, afterId: input.afterId },
        });
        return toColumnDto(column);
      }),
    );
    this.events.publish(column.boardId, access, { type: 'column.moved', payload: { column } });
    return column;
  }

  /** Cascades to the column's cards. */
  async delete(access: AccessContext, columnId: string): Promise<void> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const current = await this.findScoped(tx, access, columnId);
      await tx.column.delete({ where: { id: current.id } });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: current.boardId,
        actorId: access.userId,
        entityType: 'column',
        entityId: current.id,
        action: 'column.deleted',
        data: { name: current.name },
      });
      return current;
    });
    this.events.publish(deleted.boardId, access, {
      type: 'column.deleted',
      payload: { columnId: deleted.id },
    });
  }

  private async findScoped(tx: Prisma.TransactionClient, access: AccessContext, columnId: string) {
    const column = await tx.column.findFirst({
      where: { id: columnId, board: { workspaceId: access.workspaceId } },
    });
    if (!column) throw notFound();
    return column;
  }
}
