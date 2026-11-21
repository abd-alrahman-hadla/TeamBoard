/**
 * Public demo seed: `pnpm db:seed:demo` (DATABASE_URL must point at the target database).
 *
 * Idempotent reset, safe to run nightly (the `Reset public demo` workflow): restores the demo
 * workspace and signs the demo users out everywhere. The logic lives in src/demo/demo-reset.ts,
 * shared with the in-app "Reset demo" button (POST /demo/reset).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { DEMO_ACCOUNTS, DEMO_BOARD_ID, DEMO_PASSWORD } from '@teamboard/shared';
import { existsSync } from 'node:fs';
import { resetDemo } from '../src/demo/demo-reset';
import { PrismaClient } from '../src/generated/prisma/client';

async function seedDemo(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await resetDemo(prisma, { revokeSessions: true });
    console.log(
      `Demo ready: workspace "TeamBoard demo", board "Website launch" (/b/${DEMO_BOARD_ID}).\n` +
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
