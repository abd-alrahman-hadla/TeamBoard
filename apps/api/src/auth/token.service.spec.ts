import { JwtService } from '@nestjs/jwt';
import { parseEnv } from '../config/env';
import { generateRefreshToken, hashRefreshToken, TokenService } from './token.service';

const env = parseEnv({
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  WEB_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  ACCESS_TOKEN_TTL_SECONDS: '60',
});

describe('refresh token helpers', () => {
  it('generates distinct 256-bit base64url tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically to hex SHA-256', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken('abc')).not.toBe(hashRefreshToken('abd'));
  });
});

describe('TokenService', () => {
  const service = new TokenService(new JwtService(), env);

  it('signs an access token that verifies to its subject', async () => {
    const token = await service.signAccessToken('user-1');
    await expect(service.verifyAccessToken(token)).resolves.toEqual({ sub: 'user-1' });
  });

  it('rejects tokens signed with another secret', async () => {
    const other = new TokenService(new JwtService(), { ...env, JWT_ACCESS_SECRET: 'b'.repeat(32) });
    const token = await other.signAccessToken('user-1');
    await expect(service.verifyAccessToken(token)).resolves.toBeUndefined();
  });

  it('rejects garbage and expired tokens', async () => {
    await expect(service.verifyAccessToken('not.a.jwt')).resolves.toBeUndefined();
    const expired = await new JwtService().signAsync(
      { sub: 'user-1' },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: -10 },
    );
    await expect(service.verifyAccessToken(expired)).resolves.toBeUndefined();
  });

  it('exposes TTLs from env', () => {
    expect(service.accessTokenTtlSeconds).toBe(60);
    expect(service.refreshTokenTtlMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
