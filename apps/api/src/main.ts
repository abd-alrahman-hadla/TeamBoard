import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG, type Env } from './config/env';

async function main(): Promise<void> {
  // Variables already set in the shell (CI, Playwright) win over .env.
  if (existsSync('.env')) process.loadEnvFile('.env');

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(), { bufferLogs: true });
  const env = app.get<Env>(APP_CONFIG);
  await configureApp(app, env);
  // Nest's default host listens on every interface (IPv4 + IPv6), which hosts like Render probe.
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`TeamBoard API listening on port ${env.PORT}`);
}

main().catch((error: unknown) => {
  // Startup failures (bad env, unreachable Redis/Postgres) must exit loudly, never hang.
  console.error('TeamBoard API failed to start:', error);
  process.exit(1);
});
