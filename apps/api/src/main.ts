import 'reflect-metadata';
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
  await app.listen(env.PORT);
}

void main();
