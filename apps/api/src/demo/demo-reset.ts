import {
  DEMO_ACCOUNTS,
  DEMO_BOARD_ID as BOARD_ID,
  DEMO_PASSWORD,
  DEMO_WORKSPACE_ID as WORKSPACE_ID,
  positionBetween,
} from '@teamboard/shared';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';

const OWNER = { email: 'demo-owner@example.com', name: 'TeamBoard Demo' };

// Fixed ids: the demo board URL (and open card links) stay the same across resets.
const columnId = (i: number) => `0196d000-0000-7000-8000-0000000000${String(10 + i)}`;
const cardId = (i: number) => `0196d000-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`;

const COLUMNS = ['Backlog', 'To do', 'In progress', 'Review', 'Done'] as const;

type Who = 'sara' | 'omar';
interface SeedCard {
  column: number;
  title: string;
  labels: string[];
  assignees?: Who[];
  dueInDays?: number;
  description?: string;
  comments?: { by: Who; body: (ids: Record<Who, string>) => string }[];
}

const CARDS: SeedCard[] = [
  { column: 0, title: 'Dark mode', labels: ['design'], description: 'Respect `prefers-color-scheme`.' },
  { column: 0, title: 'Export a board to CSV', labels: ['feature'] },
  {
    column: 1,
    title: 'Pricing page copy',
    labels: ['marketing'],
    assignees: ['omar'],
    dueInDays: 5,
    description: 'Three tiers. Keep it short:\n\n- Free\n- Team\n- Business',
  },
  { column: 1, title: 'Onboarding checklist', labels: ['onboarding'], assignees: ['sara'], dueInDays: 9 },
  {
    column: 2,
    title: 'Login page',
    labels: ['frontend'],
    assignees: ['sara'],
    dueInDays: 2,
    description: '- [x] Email + password\n- [x] Error states\n- [ ] Remember the next URL',
    comments: [
      {
        by: 'omar',
        body: (ids) => `Looks great! @[Sara Haddad](${ids.sara}) can you add the loading state?`,
      },
      { by: 'sara', body: () => 'On it, pushing this afternoon.' },
    ],
  },
  { column: 2, title: 'Realtime presence avatars', labels: ['frontend', 'realtime'], assignees: ['omar'] },
  { column: 3, title: 'Invite links expire after 48h', labels: ['backend', 'security'], assignees: ['omar'] },
  { column: 4, title: 'Set up CI', labels: ['devops'], assignees: ['sara'] },
  { column: 4, title: 'Create the workspace', labels: ['onboarding'] },
];

/** n increasing fractional keys. */
function positions(n: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i += 1) keys.push(positionBetween(keys.at(-1) ?? null, null));
  return keys;
}

/** End of the local day `days` from now (how the web app stores due dates). */
function dueIn(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);
  return date;
}

export interface ResetDemoOptions {
  /**
   * Also sign the demo users out everywhere (deletes their refresh tokens). The nightly reset
   * does; the in-app button doesn't, so nobody is kicked out by someone else's click.
   */
  revokeSessions: boolean;
}

/**
 * Restores the public demo: upserts Sara, Omar and a non-login owner, deletes the demo workspace
 * and any workspace a demo user created, then recreates "TeamBoard demo" with its board.
 * Touches nothing else. Used by `pnpm db:seed:demo` and by `POST /demo/reset`.
 *
 * Inserts are batched (createMany) so the transaction stays short even when the database is far
 * from the API (every statement is a network round trip).
 */
export async function resetDemo(prisma: PrismaClient, options: ResetDemoOptions): Promise<void> {
  const demoHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  // Nobody signs in as the owner: a fresh random password every run.
  const ownerHash = await argon2.hash(randomBytes(32).toString('base64url'), { type: argon2.argon2id });

  const owner = await prisma.user.upsert({
    where: { email: OWNER.email },
    update: { name: OWNER.name, passwordHash: ownerHash },
    create: { ...OWNER, passwordHash: ownerHash },
  });
  const ids = {} as Record<Who, string>;
  for (const account of DEMO_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, passwordHash: demoHash },
      create: { email: account.email, name: account.name, passwordHash: demoHash },
    });
    ids[account.key] = user.id;
  }
  const demoUserIds = Object.values(ids);

  // Every row up front, so the transaction is a handful of statements.
  const columnKeys = positions(COLUMNS.length);
  const cardRows = COLUMNS.flatMap((_, column) => {
    const inColumn = CARDS.map((card, index) => ({ card, index })).filter((c) => c.card.column === column);
    const keys = positions(inColumn.length);
    return inColumn.map(({ card, index }, i) => ({ card, index, column, position: keys[i] ?? '' }));
  });

  await prisma.$transaction(
    async (tx) => {
      const created = await tx.membership.findMany({
        where: { userId: { in: demoUserIds }, role: 'OWNER' },
        select: { workspaceId: true },
      });
      await tx.workspace.deleteMany({
        where: { id: { in: [WORKSPACE_ID, ...created.map((m) => m.workspaceId)] } },
      });
      if (options.revokeSessions) {
        await tx.refreshToken.deleteMany({ where: { userId: { in: demoUserIds } } });
      }
      await tx.notification.deleteMany({ where: { userId: { in: demoUserIds } } });

      await tx.workspace.create({ data: { id: WORKSPACE_ID, name: 'TeamBoard demo' } });
      await tx.membership.createMany({
        data: [
          { workspaceId: WORKSPACE_ID, userId: owner.id, role: 'OWNER' },
          ...demoUserIds.map((userId) => ({ workspaceId: WORKSPACE_ID, userId, role: 'MEMBER' as const })),
        ],
      });
      await tx.board.create({ data: { id: BOARD_ID, workspaceId: WORKSPACE_ID, name: 'Website launch' } });
      await tx.column.createMany({
        data: COLUMNS.map((name, i) => ({
          id: columnId(i),
          boardId: BOARD_ID,
          name,
          position: columnKeys[i] ?? '',
        })),
      });
      await tx.card.createMany({
        data: cardRows.map(({ card, index, column, position }) => ({
          id: cardId(index),
          boardId: BOARD_ID,
          columnId: columnId(column),
          title: card.title,
          description: card.description ?? null,
          labels: card.labels,
          dueDate: card.dueInDays === undefined ? null : dueIn(card.dueInDays),
          assigneeIds: (card.assignees ?? []).map((who) => ids[who]),
          position,
          createdById: owner.id,
        })),
      });
      await tx.activity.createMany({
        data: cardRows.map(({ card, index, column }) => ({
          workspaceId: WORKSPACE_ID,
          boardId: BOARD_ID,
          actorId: owner.id,
          entityType: 'card',
          entityId: cardId(index),
          action: 'card.created',
          data: { cardTitle: card.title, columnId: columnId(column), columnName: COLUMNS[column] },
        })),
      });
      await tx.comment.createMany({
        data: cardRows.flatMap(({ card, index }) =>
          (card.comments ?? []).map((comment) => ({
            cardId: cardId(index),
            authorId: ids[comment.by],
            body: comment.body(ids),
          })),
        ),
      });
    },
    // Generous limits: a reset from an API far away from its database is ~12 round trips.
    { maxWait: 10_000, timeout: 30_000 },
  );
}
