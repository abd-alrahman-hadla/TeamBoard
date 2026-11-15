import { Injectable } from '@nestjs/common';
import type { Board, BoardDetail, CreateBoardInput, UpdateBoardInput } from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { toBoardDetailDto, toBoardDto } from './board.mappers';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  create(access: AccessContext, input: CreateBoardInput): Promise<Board> {
    return this.prisma.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: { workspaceId: access.workspaceId, name: input.name, description: input.description ?? null },
      });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId: board.id,
        actorId: access.userId,
        entityType: 'board',
        entityId: board.id,
        action: 'board.created',
        data: { name: board.name },
      });
      return toBoardDto(board);
    });
  }

  async list(access: AccessContext): Promise<Board[]> {
    const boards = await this.prisma.board.findMany({
      where: { workspaceId: access.workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return boards.map(toBoardDto);
  }

  /** Board with its columns and cards, both in position order (byte-wise, COLLATE "C"). */
  async detail(access: AccessContext, boardId: string): Promise<BoardDetail> {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, workspaceId: access.workspaceId },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: { cards: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!board) throw notFound();
    return toBoardDetailDto(board);
  }

  update(access: AccessContext, boardId: string, input: UpdateBoardInput): Promise<Board> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.board.updateMany({
        where: { id: boardId, workspaceId: access.workspaceId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw notFound();
      const board = await tx.board.findUniqueOrThrow({ where: { id: boardId } });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        boardId,
        actorId: access.userId,
        entityType: 'board',
        entityId: boardId,
        action: 'board.updated',
        data: { fields: Object.keys(input) },
      });
      return toBoardDto(board);
    });
  }

  /** Cascades to columns, cards, comments and the board's own activity; the deletion is logged at workspace level. */
  delete(access: AccessContext, boardId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const board = await tx.board.findFirst({ where: { id: boardId, workspaceId: access.workspaceId } });
      if (!board) throw notFound();
      await tx.board.delete({ where: { id: boardId } });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        actorId: access.userId,
        entityType: 'board',
        entityId: boardId,
        action: 'board.deleted',
        data: { name: board.name },
      });
    });
  }
}
