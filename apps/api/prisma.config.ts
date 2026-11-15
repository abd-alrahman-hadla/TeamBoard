import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env on its own. Variables already set in the shell win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const url = process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` doesn't need a URL. migrate/studio fail with a clear error without one.
  ...(url ? { datasource: { url } } : {}),
});
