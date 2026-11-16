import { Injectable } from '@nestjs/common';
import {
  type AssignableRole,
  canChangeRole,
  canRemoveMember,
  ERROR_CODES,
  type Member,
  type Role,
} from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { ActivityService } from '../activity/activity.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoardEventsService } from '../realtime/board-events.service';
import { toMemberDto } from './workspace.mappers';

const MEMBER_INCLUDE = { user: { select: { id: true, name: true, email: true } } } as const;

function rankViolation(target: Role): never {
  if (target === 'OWNER') {
    throw forbidden(
      'The owner cannot be changed or removed; transfer ownership instead',
      ERROR_CODES.ownerProtected,
    );
  }
  throw forbidden('Your role cannot manage this member', ERROR_CODES.roleChangeNotAllowed);
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly events: BoardEventsService,
  ) {}

  async list(access: AccessContext): Promise<Member[]> {
    const rows = await this.prisma.membership.findMany({
      where: { workspaceId: access.workspaceId },
      include: MEMBER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMemberDto);
  }

  changeRole(access: AccessContext, userId: string, role: AssignableRole): Promise<Member> {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.findMembership(tx, access.workspaceId, userId);
      if (!canChangeRole(access.role, target.role, role)) rankViolation(target.role);

      // Only apply if nobody changed this member's role in the meantime.
      const updated = await tx.membership.updateMany({
        where: { workspaceId: access.workspaceId, userId, role: target.role },
        data: { role },
      });
      if (updated.count !== 1) throw conflict(ERROR_CODES.conflict, 'Member changed, please retry');

      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        actorId: access.userId,
        entityType: 'member',
        entityId: userId,
        action: 'member.role_changed',
        data: { from: target.role, to: role },
      });
      const row = await tx.membership.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: access.workspaceId, userId } },
        include: MEMBER_INCLUDE,
      });
      return toMemberDto(row);
    });
  }

  async remove(access: AccessContext, userId: string): Promise<void> {
    const changedBoards = await this.prisma.$transaction(async (tx) => {
      const target = await this.findMembership(tx, access.workspaceId, userId);
      if (!canRemoveMember(access.role, target.role)) rankViolation(target.role);
      const boards = await this.removeMembershipTx(tx, access.workspaceId, userId);
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        actorId: access.userId,
        entityType: 'member',
        entityId: userId,
        action: 'member.removed',
        data: { role: target.role },
      });
      return boards;
    });
    await this.afterMembershipRemoved(access, userId, changedBoards);
  }

  /**
   * Deletes the membership and unassigns the user from every card in the workspace.
   * Returns the boards whose cards changed (they need a realtime resync).
   */
  async removeMembershipTx(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
  ): Promise<string[]> {
    await tx.membership.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    // Their notifications point into a workspace they can no longer open.
    await tx.notification.deleteMany({ where: { workspaceId, userId } });
    const rows = await tx.$queryRaw<{ board_id: string }[]>`
      UPDATE cards
      SET assignee_ids = array_remove(assignee_ids, ${userId}::uuid),
          version = version + 1,
          updated_at = now()
      WHERE ${userId}::uuid = ANY(assignee_ids)
        AND board_id IN (SELECT id FROM boards WHERE workspace_id = ${workspaceId}::uuid)
      RETURNING board_id`;
    return [...new Set(rows.map((row) => row.board_id))];
  }

  /** After commit: the user's sockets leave the workspace's boards; boards with unassigned cards resync. */
  async afterMembershipRemoved(
    access: AccessContext,
    userId: string,
    changedBoards: string[],
  ): Promise<void> {
    // Revoke first, so the removed user is already out of the rooms when the resync goes out.
    await this.events.revoke(access.workspaceId, userId);
    this.events.resync(changedBoards, access);
  }

  /** Throws a 400 listing the ids that aren't members of the workspace. */
  async assertMembers(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    const found = await tx.membership.findMany({
      where: { workspaceId, userId: { in: [...userIds] } },
      select: { userId: true },
    });
    const members = new Set(found.map((m) => m.userId));
    if (userIds.some((id) => !members.has(id))) {
      throw badRequest(ERROR_CODES.invalidAssignee, 'Assignees must be members of this workspace');
    }
  }

  private async findMembership(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
    const membership = await tx.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw notFound();
    return membership;
  }
}
