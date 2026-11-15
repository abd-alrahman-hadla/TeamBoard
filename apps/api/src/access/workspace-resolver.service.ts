import { Injectable } from '@nestjs/common';
import type { Role } from '@teamboard/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ScopedParam } from './access.types';

/** Finds which workspace a resource belongs to, and the caller's role there. */
@Injectable()
export class WorkspaceResolver {
  constructor(private readonly prisma: PrismaService) {}

  async workspaceOf(kind: ScopedParam, id: string): Promise<string | null> {
    switch (kind) {
      case 'workspaceId': {
        const row = await this.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
        return row?.id ?? null;
      }
      case 'boardId': {
        const row = await this.prisma.board.findUnique({ where: { id }, select: { workspaceId: true } });
        return row?.workspaceId ?? null;
      }
      case 'columnId': {
        const row = await this.prisma.column.findUnique({
          where: { id },
          select: { board: { select: { workspaceId: true } } },
        });
        return row?.board.workspaceId ?? null;
      }
      case 'cardId': {
        const row = await this.prisma.card.findUnique({
          where: { id },
          select: { board: { select: { workspaceId: true } } },
        });
        return row?.board.workspaceId ?? null;
      }
      case 'commentId': {
        const row = await this.prisma.comment.findUnique({
          where: { id },
          select: { card: { select: { board: { select: { workspaceId: true } } } } },
        });
        return row?.card.board.workspaceId ?? null;
      }
    }
  }

  async roleOf(workspaceId: string, userId: string): Promise<Role | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
