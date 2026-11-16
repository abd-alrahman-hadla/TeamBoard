/**
 * Public demo seed: `pnpm db:seed:demo` (DATABASE_URL must point at the target database).
 *
 * Idempotent reset, safe to run nightly:
 *  - upserts the two published demo users (Sara, Omar) and a non-login owner (random password),
 *  - deletes the demo workspace and any workspace a demo user created, plus the demo users'
 *    sessions, then recreates the "TeamBoard demo" workspace with a realistic board.
 * Touches nothing else in the database.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DEMO_ACCOUNTS,
  DEMO_BOARD_ID as BOARD_ID,
  DEMO_PASSWORD,
  DEMO_WORKSPACE_ID as WORKSPACE_ID,
  positionBetween,
} from '@teamboard/shared';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PrismaClient } from '../src/generated/prisma/client';

const OWNER = { email: 'demo-owner@example.com', name: 'TeamBoard Demo' };

// Fixed ids: the demo board URL stays the same across resets.
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

async function seedDemo(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
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

    await prisma.$transaction(async (tx) => {
      // Reset: the demo workspace, anything the demo users created, and their sessions.
      const created = await tx.membership.findMany({
        where: { userId: { in: demoUserIds }, role: 'OWNER' },
        select: { workspaceId: true },
      });
      await tx.workspace.deleteMany({
        where: { id: { in: [WORKSPACE_ID, ...created.map((m) => m.workspaceId)] } },
      });
      await tx.refreshToken.deleteMany({ where: { userId: { in: demoUserIds } } });
      await tx.notification.deleteMany({ where: { userId: { in: demoUserIds } } });

      await tx.workspace.create({ data: { id: WORKSPACE_ID, name: 'TeamBoard demo' } });
      await tx.membership.createMany({
        data: [
          { workspaceId: WORKSPACE_ID, userId: owner.id, role: 'OWNER' },
          ...demoUserIds.map((userId) => ({ workspaceId: WORKSPACE_ID, userId, role: 'MEMBER' as const })),
        ],
      });
      await tx.board.create({ data: { id: BOARD_ID, workspaceId: WORKSPACE_ID, name: 'Website launch' } });

      const columnKeys = positions(COLUMNS.length);
      await tx.column.createMany({
        data: COLUMNS.map((name, i) => ({
          id: columnId(i),
          boardId: BOARD_ID,
          name,
          position: columnKeys[i] ?? '',
        })),
      });

      for (const [column] of COLUMNS.entries()) {
        const inColumn = CARDS.map((card, index) => ({ card, index })).filter(
          (c) => c.card.column === column,
        );
        const keys = positions(inColumn.length);
        for (const [i, { card, index }] of inColumn.entries()) {
          const created = await tx.card.create({
            data: {
              id: cardId(index),
              boardId: BOARD_ID,
              columnId: columnId(column),
              title: card.title,
              description: card.description ?? null,
              labels: card.labels,
              dueDate: card.dueInDays === undefined ? null : dueIn(card.dueInDays),
              assigneeIds: (card.assignees ?? []).map((who) => ids[who]),
              position: keys[i] ?? '',
              createdById: owner.id,
            },
          });
          await tx.activity.create({
            data: {
              workspaceId: WORKSPACE_ID,
              boardId: BOARD_ID,
              actorId: owner.id,
              entityType: 'card',
              entityId: created.id,
              action: 'card.created',
              data: { cardTitle: created.title, columnId: created.columnId, columnName: COLUMNS[column] },
            },
          });
          for (const comment of card.comments ?? []) {
            await tx.comment.create({
              data: { cardId: created.id, authorId: ids[comment.by], body: comment.body(ids) },
            });
          }
        }
      }
    });

    console.log(
      `Demo ready: workspace "TeamBoard demo", board "Website launch" (/b/${BOARD_ID}).\n` +
        `Sign in as ${DEMO_ACCOUNTS.map((a) => a.email).join(' or ')} (password: ${DEMO_PASSWORD}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seedDemo().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
