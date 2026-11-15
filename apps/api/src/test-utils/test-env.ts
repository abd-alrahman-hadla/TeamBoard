import type { RawEnv } from '../config/env';

export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgresql://teamboard:teamboard@localhost:5433/teamboard_test';

export const TEST_WEB_ORIGIN = 'http://localhost:3000';

/** Integration tests must never touch the dev database. */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${name}": the database name must end in _test`,
    );
  }
}

export function testEnv(overrides: RawEnv = {}): RawEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    JWT_ACCESS_SECRET: 'integration-test-secret-that-is-long-enough',
    ACCESS_TOKEN_TTL_SECONDS: '900',
    REFRESH_TOKEN_TTL_DAYS: '7',
    COOKIE_SECURE: 'false',
    COOKIE_DOMAIN: '',
    AUTH_RATE_LIMIT: '1000',
    SWAGGER_ENABLED: 'true',
    ...overrides,
  };
}
