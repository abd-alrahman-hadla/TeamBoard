import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { PrismaClient } from '../src/generated/prisma/client';

const DEMO_USER = { email: 'demo@teamboard.dev', name: 'Demo User', password: 'demo-password' };

async function seed(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const passwordHash = await argon2.hash(DEMO_USER.password, { type: argon2.argon2id });
    // Idempotent: re-running keeps the user and resets its password to the documented one.
    await prisma.user.upsert({
      where: { email: DEMO_USER.email },
      update: { name: DEMO_USER.name, passwordHash },
      create: { email: DEMO_USER.email, name: DEMO_USER.name, passwordHash },
    });
    console.log(`Seeded ${DEMO_USER.email} / ${DEMO_USER.password}`);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
