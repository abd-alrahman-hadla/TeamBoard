import { Injectable } from '@nestjs/common';
import {
  type CreateWorkspaceInput,
  ERROR_CODES,
  type MyWorkspace,
  type UpdateWorkspaceInput,
  type Workspace,
} from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { ActivityService } from '../activity/activity.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { BoardEventsService } from '../realtime/board-events.service';
import { MembersService } from './members.service';
import { toMyWorkspaceDto, toWorkspaceDto } from './workspace.mappers';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly members: MembersService,
    private readonly events: BoardEventsService,
  ) {}

  /** The creator becomes the one OWNER. */
  create(userId: string, input: CreateWorkspaceInput): Promise<MyWorkspace> {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: input.name, memberships: { create: { userId, role: 'OWNER' } } },
      });
      await this.activity.record(tx, {
        workspaceId: workspace.id,
        actorId: userId,
        entityType: 'workspace',
        entityId: workspace.id,
        action: 'workspace.created',
        data: { name: workspace.name },
      });
      return toMyWorkspaceDto(workspace, 'OWNER');
    });
  }

  async listMine(userId: string): Promise<MyWorkspace[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { workspace: { createdAt: 'asc' } },
    });
    return memberships.map((m) => toMyWorkspaceDto(m.workspace, m.role));
  }

  async get(access: AccessContext): Promise<MyWorkspace> {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: access.workspaceId } });
    if (!workspace) throw notFound();
    return toMyWorkspaceDto(workspace, access.role);
  }

  update(access: AccessContext, input: UpdateWorkspaceInput): Promise<Workspace> {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.update({
        where: { id: access.workspaceId },
        data: { name: input.name },
      });
      await this.activity.record(tx, {
        workspaceId: workspace.id,
        actorId: access.userId,
        entityType: 'workspace',
        entityId: workspace.id,
        action: 'workspace.updated',
        data: { name: workspace.name },
      });
      return toWorkspaceDto(workspace);
    });
  }

  /** Cascades to memberships, invitations, boards, columns, cards, comments and activity. */
  async delete(access: AccessContext): Promise<void> {
    const boards = await this.prisma.board.findMany({
      where: { workspaceId: access.workspaceId },
      select: { id: true },
    });
    await this.prisma.workspace.delete({ where: { id: access.workspaceId } });
    for (const board of boards) this.events.closeBoard(board.id, access);
  }

  /** The owner hands ownership to another member and becomes an admin. */
  transferOwnership(access: AccessContext, newOwnerId: string): Promise<void> {
    if (newOwnerId === access.userId) {
      throw badRequest(ERROR_CODES.roleChangeNotAllowed, 'You already own this workspace');
    }
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: access.workspaceId, userId: newOwnerId } },
      });
      if (!target) throw notFound();

      // Conditional demotion keeps "exactly one owner" true even under concurrent transfers.
      const demoted = await tx.membership.updateMany({
        where: { workspaceId: access.workspaceId, userId: access.userId, role: 'OWNER' },
        data: { role: 'ADMIN' },
      });
      if (demoted.count !== 1) throw conflict(ERROR_CODES.conflict, 'Ownership changed, please retry');

      await tx.membership.update({
        where: { workspaceId_userId: { workspaceId: access.workspaceId, userId: newOwnerId } },
        data: { role: 'OWNER' },
      });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        actorId: access.userId,
        entityType: 'member',
        entityId: newOwnerId,
        action: 'workspace.ownership_transferred',
        data: { from: access.userId, to: newOwnerId },
      });
    });
  }

  /** Anyone but the owner may leave; the owner must transfer ownership first. */
  async leave(access: AccessContext): Promise<void> {
    if (access.role === 'OWNER') {
      throw forbidden('Transfer ownership before leaving the workspace', ERROR_CODES.ownerProtected);
    }
    const changedBoards = await this.prisma.$transaction(async (tx) => {
      const boards = await this.members.removeMembershipTx(tx, access.workspaceId, access.userId);
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        actorId: access.userId,
        entityType: 'member',
        entityId: access.userId,
        action: 'member.left',
      });
      return boards;
    });
    await this.members.afterMembershipRemoved(access, access.userId, changedBoards);
  }
}
