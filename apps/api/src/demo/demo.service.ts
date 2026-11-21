import { HttpStatus, Injectable } from '@nestjs/common';
import { DEMO_BOARD_ID, DEMO_WORKSPACE_ID, ERROR_CODES } from '@teamboard/shared';
import { AppException } from '../common/app.exception';
import { notFound } from '../common/errors';
import { type Env, InjectEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { BoardEventsService } from '../realtime/board-events.service';
import { resetDemo } from './demo-reset';

/** One reset per minute at most, for everyone: the demo workspace's age is the clock. */
export const DEMO_RESET_COOLDOWN_MS = 60_000;

/** Seconds left before the demo may be reset again, or 0. */
export function cooldownRemaining(lastResetAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((lastResetAt.getTime() + DEMO_RESET_COOLDOWN_MS - now.getTime()) / 1000));
}

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BoardEventsService,
    @InjectEnv() private readonly env: Env,
  ) {}

  /**
   * The in-app "Reset demo" button. Only when DEMO_MODE is on, and only for members of the demo
   * workspace (everyone else gets the usual 404). Keeps the demo users signed in.
   */
  async reset(userId: string, clientId: string | null): Promise<void> {
    if (!this.env.DEMO_MODE) throw notFound();
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: DEMO_WORKSPACE_ID, userId } },
      select: { workspace: { select: { createdAt: true } } },
    });
    if (!membership) throw notFound();

    const wait = cooldownRemaining(membership.workspace.createdAt, new Date());
    if (wait > 0) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.rateLimited,
        `The demo was just reset. Try again in ${wait} seconds.`,
      );
    }

    await resetDemo(this.prisma, { revokeSessions: false });
    // After commit: every open demo board refetches (the caller's tab refreshes itself).
    this.events.resync([DEMO_BOARD_ID], { userId, clientId });
  }
}
