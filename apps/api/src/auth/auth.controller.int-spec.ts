import { AUTH_COOKIES, authResponseSchema, type AuthResponse, userSchema } from '@teamboard/shared';
import { hashRefreshToken } from './token.service';
import {
  createTestApp,
  ORIGIN_HEADER,
  readSetCookie,
  refreshCookieHeader,
  resetDb,
  TEST_PASSWORD,
  type TestApp,
  uniqueEmail,
} from '../test-utils/test-app';

interface SignedIn {
  email: string;
  body: AuthResponse;
  refreshToken: string;
}

describe('AuthController (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  async function register(email = uniqueEmail()): Promise<SignedIn> {
    const res = await t
      .http()
      .post('/auth/register')
      .send({ name: 'Ada', email, password: TEST_PASSWORD })
      .expect(201);
    const refreshToken = readSetCookie(res.headers['set-cookie'], AUTH_COOKIES.refreshToken);
    if (!refreshToken) throw new Error('register did not set a refresh cookie');
    return { email, body: authResponseSchema.parse(res.body), refreshToken };
  }

  function refresh(token: string) {
    return t.http().post('/auth/refresh').set(ORIGIN_HEADER).set('Cookie', refreshCookieHeader(token));
  }

  describe('POST /auth/register', () => {
    it('creates the user, returns an access token and sets both cookies', async () => {
      const res = await t
        .http()
        .post('/auth/register')
        .send({ name: '  Ada Lovelace ', email: 'Ada@Example.com', password: TEST_PASSWORD })
        .expect(201);

      const body = authResponseSchema.parse(res.body);
      expect(body.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
      expect(body.expiresIn).toBe(900);
      expect(res.headers['cache-control']).toBe('no-store');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIES.refreshToken}=`));
      expect(refreshCookie).toMatch(/HttpOnly/);
      expect(refreshCookie).toMatch(/Path=\/auth/);
      expect(refreshCookie).toMatch(/SameSite=Lax/);
      expect(cookies.find((c) => c.startsWith(`${AUTH_COOKIES.sessionHint}=1`))).not.toMatch(/HttpOnly/);

      const stored = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('stores only the hash of the refresh token', async () => {
      const { refreshToken } = await register();
      const rows = await t.prisma.refreshToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(hashRefreshToken(refreshToken));
      expect(rows[0]?.tokenHash).not.toContain(refreshToken);
    });

    it('rejects a duplicate email with 409 email_taken', async () => {
      const { email } = await register();
      const res = await t
        .http()
        .post('/auth/register')
        .send({ name: 'Other', email: email.toUpperCase(), password: TEST_PASSWORD })
        .expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, code: 'email_taken' });
    });

    it('rejects invalid input with 400 and per-field details', async () => {
      const res = await t
        .http()
        .post('/auth/register')
        .send({ name: '', email: 'nope', password: 'short' })
        .expect(400);
      expect(res.body.code).toBe('validation_failed');
      const paths = (res.body.details as { path: string }[]).map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
    });
  });

  describe('POST /auth/login', () => {
    it('signs in with the right password', async () => {
      const { email } = await register();
      const res = await t.http().post('/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);
      expect(authResponseSchema.parse(res.body).user.email).toBe(email);
      expect(readSetCookie(res.headers['set-cookie'], AUTH_COOKIES.refreshToken)).toBeDefined();
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const { email } = await register();
      const wrong = await t
        .http()
        .post('/auth/login')
        .send({ email, password: 'wrong password' })
        .expect(401);
      const unknown = await t
        .http()
        .post('/auth/login')
        .send({ email: uniqueEmail('ghost'), password: TEST_PASSWORD })
        .expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.code).toBe('invalid_credentials');
    });

    it('starts a separate token family per sign-in', async () => {
      const { email } = await register();
      await t.http().post('/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);
      const families = await t.prisma.refreshToken.groupBy({ by: ['familyId'] });
      expect(families).toHaveLength(2);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the user for a valid access token', async () => {
      const { body } = await register();
      const res = await t
        .http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(userSchema.parse(res.body)).toEqual(body.user);
    });

    it('rejects missing and forged tokens', async () => {
      await t.http().get('/auth/me').expect(401);
      const res = await t.http().get('/auth/me').set('Authorization', 'Bearer not.a.token').expect(401);
      expect(res.body.code).toBe('unauthorized');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates: returns a new access token and a new refresh cookie, and retires the old token', async () => {
      const first = await register();
      const res = await refresh(first.refreshToken).expect(200);

      const next = readSetCookie(res.headers['set-cookie'], AUTH_COOKIES.refreshToken);
      expect(next).toBeDefined();
      expect(next).not.toBe(first.refreshToken);
      expect(authResponseSchema.parse(res.body).user.id).toBe(first.body.user.id);

      const old = await t.prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(first.refreshToken) },
      });
      const successor = await t.prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(next ?? '') },
      });
      expect(old.revokedAt).not.toBeNull();
      expect(old.replacedById).toBe(successor.id);
      expect(successor.familyId).toBe(old.familyId);
      expect(successor.revokedAt).toBeNull();
    });

    it('rejects reuse of a rotated token and revokes the whole family', async () => {
      const first = await register();
      const rotated = await refresh(first.refreshToken).expect(200);
      const current = readSetCookie(rotated.headers['set-cookie'], AUTH_COOKIES.refreshToken) ?? '';

      // An attacker replays the stolen, already-rotated token.
      const replay = await refresh(first.refreshToken).expect(401);
      expect(replay.body.code).toBe('refresh_token_reused');
      expect(readSetCookie(replay.headers['set-cookie'], AUTH_COOKIES.refreshToken)).toBe('');

      // The legitimate holder's newer token is now dead too.
      const victim = await refresh(current).expect(401);
      expect(victim.body.code).toBe('refresh_token_reused');

      const live = await t.prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(live).toBe(0);
    });

    it('does not touch other sign-ins of the same user when one family is compromised', async () => {
      const first = await register();
      const other = await t.http().post('/auth/login').send({ email: first.email, password: TEST_PASSWORD });
      const otherToken = readSetCookie(other.headers['set-cookie'], AUTH_COOKIES.refreshToken) ?? '';

      await refresh(first.refreshToken).expect(200);
      await refresh(first.refreshToken).expect(401);

      await refresh(otherToken).expect(200);
    });

    it('treats two concurrent rotations of the same token as reuse (one wins, then the family dies)', async () => {
      const first = await register();
      const results = await Promise.all([refresh(first.refreshToken), refresh(first.refreshToken)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 401]);
      expect(await t.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('rejects an expired token without revoking the family', async () => {
      const first = await register();
      await t.prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await refresh(first.refreshToken).expect(401);
      expect(res.body.code).toBe('refresh_token_invalid');
    });

    it('rejects a missing or unknown token', async () => {
      const missing = await t.http().post('/auth/refresh').set(ORIGIN_HEADER).expect(401);
      expect(missing.body.code).toBe('refresh_token_invalid');
      const unknown = await refresh('made-up-token').expect(401);
      expect(unknown.body.code).toBe('refresh_token_invalid');
    });

    it('rejects requests without the web origin (CSRF defence)', async () => {
      const { refreshToken } = await register();
      const noOrigin = await t
        .http()
        .post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(refreshToken))
        .expect(403);
      expect(noOrigin.body.code).toBe('forbidden_origin');
      await t
        .http()
        .post('/auth/refresh')
        .set('Origin', 'https://evil.example')
        .set('Cookie', refreshCookieHeader(refreshToken))
        .expect(403);
      // The token was not consumed by the rejected attempts.
      await refresh(refreshToken).expect(200);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the family and clears both cookies', async () => {
      const { refreshToken } = await register();
      const res = await t
        .http()
        .post('/auth/logout')
        .set(ORIGIN_HEADER)
        .set('Cookie', refreshCookieHeader(refreshToken))
        .expect(204);
      expect(readSetCookie(res.headers['set-cookie'], AUTH_COOKIES.refreshToken)).toBe('');
      expect(readSetCookie(res.headers['set-cookie'], AUTH_COOKIES.sessionHint)).toBe('');

      const after = await refresh(refreshToken).expect(401);
      expect(after.body.code).toBe('refresh_token_reused');
    });

    it('is idempotent without a cookie', async () => {
      await t.http().post('/auth/logout').set(ORIGIN_HEADER).expect(204);
    });
  });
});

describe('AuthController access-token expiry (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ACCESS_TOKEN_TTL_SECONDS: '1' });
    await resetDb(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('rejects an expired access token, and a refresh issues a working one', async () => {
    const res = await t
      .http()
      .post('/auth/register')
      .send({ name: 'Ada', email: uniqueEmail(), password: TEST_PASSWORD })
      .expect(201);
    const body = authResponseSchema.parse(res.body);
    const refreshToken = readSetCookie(res.headers['set-cookie'], AUTH_COOKIES.refreshToken) ?? '';

    await new Promise((resolve) => setTimeout(resolve, 2100));
    await t.http().get('/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(401);

    const refreshed = await t
      .http()
      .post('/auth/refresh')
      .set(ORIGIN_HEADER)
      .set('Cookie', refreshCookieHeader(refreshToken))
      .expect(200);
    const { accessToken } = authResponseSchema.parse(refreshed.body);
    await t.http().get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });
});

describe('AuthController rate limiting (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ AUTH_RATE_LIMIT: '3' });
    await resetDb(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('returns 429 rate_limited after AUTH_RATE_LIMIT login attempts per minute', async () => {
    const attempt = () => t.http().post('/auth/login').send({ email: 'a@b.co', password: 'nope' });
    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).status).toBe(401);
    }
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('rate_limited');
    expect(limited.headers['retry-after-auth']).toBeDefined();
  });

  it('does not rate limit /auth/me', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await t.http().get('/auth/me')).status).toBe(401);
    }
  });
});
