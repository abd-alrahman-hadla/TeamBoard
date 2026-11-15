import { HttpStatus, Injectable } from '@nestjs/common';
import {
  canInviteAs,
  type CreatedInvitation,
  type CreateInvitationInput,
  ERROR_CODES,
  type Invitation,
  type InvitationPreview,
  type MyWorkspace,
} from '@teamboard/shared';
import type { AccessContext } from '../access/access.types';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/app.exception';
import { conflict, forbidden, notFound } from '../common/errors';
import { generateOpaqueToken, hashOpaqueToken, isOpaqueToken } from '../common/opaque-token';
import { type Env, InjectEnv } from '../config/env';
import type { Prisma } from '../generated/prisma/client';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { toMyWorkspaceDto } from '../workspaces/workspace.mappers';

const INVITATION_INCLUDE = { invitedBy: { select: { id: true, name: true } } } as const;
type InvitationRow = Prisma.InvitationGetPayload<{ include: typeof INVITATION_INCLUDE }>;

function toInvitationDto(row: InvitationRow): Invitation {
  if (row.role === 'OWNER') throw new Error('Invitations never carry the OWNER role');
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedBy: row.invitedBy,
  };
}

/** "ada@example.com" → "a**@example.com": enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

const invalidInvitation = () =>
  new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.invitationInvalid, 'This invitation is not valid');
const expiredInvitation = () =>
  new AppException(HttpStatus.GONE, ERROR_CODES.invitationExpired, 'This invitation has expired');

function isPending(row: { acceptedAt: Date | null; revokedAt: Date | null }): boolean {
  return row.acceptedAt === null && row.revokedAt === null;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly mailer: Mailer,
    @InjectEnv() private readonly env: Env,
  ) {}

  async create(access: AccessContext, input: CreateInvitationInput): Promise<CreatedInvitation> {
    if (!canInviteAs(access.role, input.role)) {
      throw forbidden('Your role cannot invite with this role', ERROR_CODES.roleChangeNotAllowed);
    }
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.env.INVITATION_TTL_HOURS * 60 * 60 * 1000);

    const { invitation, workspaceName, inviterName } = await this.prisma.$transaction(async (tx) => {
      const existingMember = await tx.membership.findFirst({
        where: { workspaceId: access.workspaceId, user: { email: input.email } },
        select: { userId: true },
      });
      if (existingMember) throw conflict(ERROR_CODES.alreadyMember, 'This person is already a member');

      // One live invitation per email: a re-invite replaces the previous link.
      await tx.invitation.updateMany({
        where: { workspaceId: access.workspaceId, email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const row = await tx.invitation.create({
        data: {
          workspaceId: access.workspaceId,
          email: input.email,
          role: input.role,
          tokenHash: hashOpaqueToken(token),
          invitedById: access.userId,
          expiresAt,
        },
        include: { ...INVITATION_INCLUDE, workspace: { select: { name: true } } },
      });
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        actorId: access.userId,
        entityType: 'invitation',
        entityId: row.id,
        action: 'invitation.created',
        data: { role: input.role },
      });
      return { invitation: row, workspaceName: row.workspace.name, inviterName: row.invitedBy?.name ?? null };
    });

    const link = `${new URL(this.env.WEB_ORIGIN).origin}/invite/${token}`;
    await this.mailer.sendInvitation({ to: input.email, link, workspaceName, inviterName, expiresAt });
    return { invitation: toInvitationDto(invitation), link };
  }

  /** Pending, unexpired invitations. */
  async list(access: AccessContext): Promise<Invitation[]> {
    const rows = await this.prisma.invitation.findMany({
      where: {
        workspaceId: access.workspaceId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: INVITATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toInvitationDto);
  }

  revoke(access: AccessContext, invitationId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.invitation.updateMany({
        where: { id: invitationId, workspaceId: access.workspaceId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw notFound();
      await this.activity.record(tx, {
        workspaceId: access.workspaceId,
        actorId: access.userId,
        entityType: 'invitation',
        entityId: invitationId,
        action: 'invitation.revoked',
      });
    });
  }

  /** Public: what the invite page shows before the invitee signs in. */
  async preview(token: string): Promise<InvitationPreview> {
    const row = await this.findUsable(this.prisma, token);
    const invitation = await this.prisma.invitation.findUniqueOrThrow({
      where: { id: row.id },
      include: { workspace: { select: { id: true, name: true } }, invitedBy: { select: { name: true } } },
    });
    if (invitation.role === 'OWNER') throw invalidInvitation();
    return {
      workspace: invitation.workspace,
      role: invitation.role,
      email: maskEmail(invitation.email),
      invitedBy: invitation.invitedBy?.name ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  accept(token: string, userId: string): Promise<MyWorkspace> {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await this.findUsable(tx, token);

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      if (user.email !== invitation.email) {
        throw forbidden(
          'This invitation was sent to a different email address',
          ERROR_CODES.invitationEmailMismatch,
        );
      }
      const existing = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      });
      if (existing) throw conflict(ERROR_CODES.alreadyMember, 'You are already a member of this workspace');

      // Claim the invitation; a concurrent accept of the same link loses here.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date(), acceptedById: userId },
      });
      if (claimed.count !== 1) throw invalidInvitation();

      const membership = await tx.membership.create({
        data: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
        include: { workspace: true },
      });
      await this.activity.record(tx, {
        workspaceId: invitation.workspaceId,
        actorId: userId,
        entityType: 'member',
        entityId: userId,
        action: 'member.joined',
        data: { role: invitation.role, invitationId: invitation.id },
      });
      return toMyWorkspaceDto(membership.workspace, membership.role);
    });
  }

  private async findUsable(db: Prisma.TransactionClient, token: string) {
    if (!isOpaqueToken(token)) throw invalidInvitation();
    const invitation = await db.invitation.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    if (!invitation || !isPending(invitation)) throw invalidInvitation();
    if (invitation.expiresAt.getTime() <= Date.now()) throw expiredInvitation();
    return invitation;
  }
}
