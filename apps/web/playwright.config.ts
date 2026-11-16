import { defineConfig, devices } from '@playwright/test';
import { E2E } from './e2e/e2e-env';

/**
 * Runs against production builds on their own ports (web 3100, api 4100) and database (teamboard_e2e),
 * so it never collides with dev servers. `pnpm e2e` from the repo root builds the API first (turbo.json).
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  use: {
    baseURL: E2E.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: 'node ../api/dist/main.js',
      url: `${E2E.apiUrl}/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'production',
        PORT: String(E2E.apiPort),
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E.databaseUrl,
        WEB_ORIGIN: E2E.webUrl,
        JWT_ACCESS_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
        ACCESS_TOKEN_TTL_SECONDS: String(E2E.accessTokenTtlSeconds),
        REFRESH_TOKEN_TTL_DAYS: '7',
        COOKIE_SECURE: 'false',
        AUTH_RATE_LIMIT: '1000',
        SWAGGER_ENABLED: 'false',
        REDIS_URL: 'redis://localhost:6379',
        INSTANCE_ID: 'e2e',
      },
    },
    {
      name: 'web',
      command: `pnpm exec next build && pnpm exec next start -p ${E2E.webPort}`,
      url: E2E.webUrl + '/login',
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: E2E.apiUrl,
        // Exposes window.__teamboardSocket for the reconnect test (see src/lib/socket.ts).
        NEXT_PUBLIC_E2E: '1',
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
