import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** `pnpm docs:gif`: records docs/live-demo.gif with the same servers and database as the e2e suite. */
export default defineConfig({
  ...base,
  testDir: './docs-gif',
  testMatch: 'record-demo.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
