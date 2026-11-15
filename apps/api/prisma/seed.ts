import { PrismaPg } from '@prisma/adapter-pg';
import { positionBetween } from '@teamboard/shared';
import argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { PrismaClient } from '../src/generated/prisma/client';

const PASSWORD = 'demo-password';
const USERS = [
  { email: 'demo@teamboard.dev', name: 'Demo Owner' },
  { email: 'member@teamboard.dev', name: 'Mo Member' },
] as const;

// Fixed ids make the seed idempotent: re-running updates instead of duplicating.
const IDS = {
  workspace: '0195a000-0000-7000-8000-000000000001',
  board: '0195a000-0000-7000-8000-000000000002',
  columns: [
    '0195a000-0000-7000-8000-000000000010',
    '0195a000-0000-7000-8000-000000000011',
    '0195a000-0000-7000-8000-000000000012',
  ],
} as const;

const COLUMNS = ['To do', 'In progress', 'Done'] as const;
const CARDS: { column: number; title: string; labels: string[]; description?: string }[] = [
  { column: 0, title: 'Invite the team', labels: ['onboarding'], description: 'Use **Members → Invite**.' },
  { column: 0, title: 'Sketch the roadmap', labels: ['planning'] },
  { column: 1, title: 'Set up the board', labels: [] },
  { column: 2, title: 'Create a workspace', labels: ['onboarding'] },
];

function cardId(index: number): string {
  return `0195a000-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`;
}

/** n increasing fractional keys. */
function positions(n: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i += 1) keys.push(positionBetween(keys.at(-1) ?? null, null));
  return keys;
}

async function seed(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const [owner, member] = await Promise.all(
      USERS.map((user) =>
        prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name, passwordHash },
          create: { ...user, passwordHash },
        }),
      ),
    );
    if (!owner || !member) throw new Error('seed users missing');

    await prisma.$transaction(async (tx) => {
      await tx.workspace.upsert({
        where: { id: IDS.workspace },
        update: { name: 'Acme' },
        create: { id: IDS.workspace, name: 'Acme' },
      });
      for (const [userId, role] of [
        [owner.id, 'OWNER'],
        [member.id, 'MEMBER'],
      ] as const) {
        await tx.membership.upsert({
          where: { workspaceId_userId: { workspaceId: IDS.workspace, userId } },
          update: { role },
          create: { workspaceId: IDS.workspace, userId, role },
        });
      }
      await tx.board.upsert({
        where: { id: IDS.board },
        update: { name: 'Product roadmap' },
        create: { id: IDS.board, workspaceId: IDS.workspace, name: 'Product roadmap' },
      });

      // Reset demo columns/cards to their documented order, so the seed is idempotent even after edits.
      const columnKeys = positions(COLUMNS.length);
      await tx.card.deleteMany({ where: { boardId: IDS.board } });
      await tx.column.deleteMany({ where: { boardId: IDS.board } });
      for (const [i, name] of COLUMNS.entries()) {
        await tx.column.create({
          data: { id: IDS.columns[i] ?? '', boardId: IDS.board, name, position: columnKeys[i] ?? '' },
        });
      }
      const cardKeys = positions(CARDS.length);
      for (const [i, card] of CARDS.entries()) {
        await tx.card.create({
          data: {
            id: cardId(i),
            boardId: IDS.board,
            columnId: IDS.columns[card.column] ?? '',
            title: card.title,
            description: card.description ?? null,
            labels: card.labels,
            assigneeIds: i === 0 ? [member.id] : [],
            position: cardKeys[i] ?? '',
            createdById: owner.id,
          },
        });
      }
    });

    console.log(
      `Seeded workspace "Acme" with ${USERS.map((u) => u.email).join(', ')} (password: ${PASSWORD})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
