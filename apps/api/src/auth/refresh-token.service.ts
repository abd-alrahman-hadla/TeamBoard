import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateRefreshToken, hashRefreshToken, TokenService } from './token.service';

export interface ClientMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export type RotationResult =
  { kind: 'rotated'; userId: string; refreshToken: string } | { kind: 'reused' } | { kind: 'invalid' };

type Tx = Prisma.TransactionClient;

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Starts a new token family (login / register). Returns the raw token for the cookie. */
  issue(userId: string, meta: ClientMeta): Promise<string> {
    return this.create(this.prisma, userId, randomUUID(), meta).then((created) => created.raw);
  }

  /**
   * Swaps a refresh token for a new one in the same family.
   * Presenting a token that was already rotated (or revoked) is treated as theft:
   * the whole family is revoked so neither the attacker nor the victim can continue.
   */
  rotate(rawToken: string, meta: ClientMeta): Promise<RotationResult> {
    const tokenHash = hashRefreshToken(rawToken);
    return this.prisma.$transaction(async (tx): Promise<RotationResult> => {
      const current = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!current) return { kind: 'invalid' };

      if (current.revokedAt) {
        await this.revokeFamilyTx(tx, current.familyId);
        return { kind: 'reused' };
      }
      if (current.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' };

      // Conditional claim: of two concurrent rotations of the same token, only one wins.
      // The loser blocks on the row lock, sees revokedAt set, and is treated as reuse.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) {
        await this.revokeFamilyTx(tx, current.familyId);
        return { kind: 'reused' };
      }

      const next = await this.create(tx, current.userId, current.familyId, meta);
      await tx.refreshToken.update({ where: { id: current.id }, data: { replacedById: next.id } });
      return { kind: 'rotated', userId: current.userId, refreshToken: next.raw };
    });
  }

  /** Logout: revokes every token in the presented token's family. Unknown tokens are ignored. */
  async revokeFamilyOf(rawToken: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      select: { familyId: true },
    });
    if (current) await this.revokeFamilyTx(this.prisma, current.familyId);
  }

  private async revokeFamilyTx(tx: Tx, familyId: string): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async create(
    tx: Tx,
    userId: string,
    familyId: string,
    meta: ClientMeta,
  ): Promise<{ id: string; raw: string }> {
    const raw = generateRefreshToken();
    const row = await tx.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashRefreshToken(raw),
        expiresAt: new Date(Date.now() + this.tokens.refreshTokenTtlMs),
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        ip: meta.ip ?? null,
      },
      select: { id: true },
    });
    return { id: row.id, raw };
  }
}
