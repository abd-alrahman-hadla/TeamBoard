import { parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  WEB_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
      COOKIE_SECURE: false,
      AUTH_RATE_LIMIT: 10,
      SWAGGER_ENABLED: true,
    });
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('coerces numbers and booleans from strings', () => {
    const env = parseEnv({ ...valid, PORT: '4100', COOKIE_SECURE: 'true', AUTH_RATE_LIMIT: '3' });
    expect(env.PORT).toBe(4100);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.AUTH_RATE_LIMIT).toBe(3);
  });

  it('treats empty strings as unset', () => {
    expect(parseEnv({ ...valid, COOKIE_DOMAIN: '' }).COOKIE_DOMAIN).toBeUndefined();
  });

  it('rejects a short JWT secret with a readable message', () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32 characters/);
  });

  it('rejects missing required variables', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });
});
