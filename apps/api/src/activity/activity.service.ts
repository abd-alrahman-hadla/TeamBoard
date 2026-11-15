import { Injectable } from '@nestjs/common';
import type { Activity, ActivityPage } from '@teamboard/shared';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EntityType = 'workspace' | 'member' | 'invitation' | 'board' | 'column' | 'card' | 'comment';

export interface ActivityEntry {
  workspaceId: string;
  boardId?: string | null;
  actorId: string;
  entityType: EntityType;
  entityId: string;
  action: string;
  /** Never put secrets or invitee emails here: every workspace viewer can read activity. */
  data?: Prisma.InputJsonObject;
}

const ACTIVITY_INCLUDE = { actor: { select: { id: true, name: true } } } as const;

type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof ACTIVITY_INCLUDE }>;

function toActivityDto(row: ActivityRow): Activity {
  const data = row.data;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    boardId: row.boardId,
    actor: row.actor,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    data: typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {},
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Call inside the transaction that makes the change, so the log can't drift from the data. */
  async record(tx: Prisma.TransactionClient, entry: ActivityEntry): Promise<void> {
    await tx.activity.create({
      data: {
        workspaceId: entry.workspaceId,
        boardId: entry.boardId ?? null,
        actorId: entry.actorId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        data: entry.data ?? {},
      },
    });
  }

  /** Newest first. uuid v7 ids are time-ordered, so `id < cursor` pages backwards in time. */
  async list(
    scope: { workspaceId: string; boardId?: string },
    page: { cursor?: string | undefined; limit: number },
  ): Promise<ActivityPage> {
    const rows = await this.prisma.activity.findMany({
      where: {
        workspaceId: scope.workspaceId,
        ...(scope.boardId ? { boardId: scope.boardId } : {}),
        ...(page.cursor ? { id: { lt: page.cursor } } : {}),
      },
      include: ACTIVITY_INCLUDE,
      orderBy: { id: 'desc' },
      take: page.limit + 1,
    });
    const items = rows.slice(0, page.limit).map(toActivityDto);
    const nextCursor = rows.length > page.limit ? (items.at(-1)?.id ?? null) : null;
    return { items, nextCursor };
  }
}
