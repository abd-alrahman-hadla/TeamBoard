import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AUTH_COOKIES } from '@teamboard/shared';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../bootstrap';
import { APP_CONFIG, type Env, type RawEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { assertTestDatabase, TEST_WEB_ORIGIN, testEnv } from './test-env';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  env: Env;
  http: () => request.Agent;
  /** Base URL when created with `listen: true` (for socket.io clients). */
  url: string;
  close: () => Promise<void>;
}

export async function createTestApp(
  overrides: RawEnv = {},
  options: { listen?: boolean } = {},
): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(testEnv(overrides))],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  const env = app.get<Env>(APP_CONFIG);
  assertTestDatabase(env.DATABASE_URL);
  await configureApp(app, env);
  let url = '';
  if (options.listen) {
    await app.listen(0, '127.0.0.1');
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  } else {
    await app.init();
  }
  return {
    app,
    env,
    url,
    prisma: app.get(PrismaService),
    http: () => request.agent(app.getHttpServer()),
    close: () => app.close(),
  };
}

/** Empties every application table (keeps Prisma's migration history). */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/** Pulls one cookie out of a response's Set-Cookie headers. */
export function readSetCookie(setCookie: string | string[] | undefined, name: string): string | undefined {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const header = headers.find((value) => value.startsWith(`${name}=`));
  return header?.slice(name.length + 1).split(';')[0];
}

export function refreshCookieHeader(token: string): string {
  return `${AUTH_COOKIES.refreshToken}=${token}`;
}

export const ORIGIN_HEADER = { Origin: TEST_WEB_ORIGIN } as const;

let counter = 0;
export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@test.dev`;
}

export const TEST_PASSWORD = 'correct horse battery';
