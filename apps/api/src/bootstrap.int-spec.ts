import { createTestApp, type TestApp } from './test-utils/test-app';
import { TEST_WEB_ORIGIN } from './test-utils/test-env';

describe('HTTP platform (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('sets helmet security headers and hides x-powered-by', async () => {
    const res = await t.http().get('/health/live').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows credentialed CORS from the web origin only', async () => {
    const allowed = await t
      .http()
      .options('/auth/refresh')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(TEST_WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await t
      .http()
      .options('/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('echoes or mints an X-Request-Id', async () => {
    const echoed = await t.http().get('/health/live').set('X-Request-Id', 'req-123').expect(200);
    expect(echoed.headers['x-request-id']).toBe('req-123');
    const minted = await t.http().get('/health/live').expect(200);
    expect(minted.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('serves the OpenAPI document with the auth routes and Zod-derived schemas', async () => {
    const res = await t.http().get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<
        string,
        Record<string, { requestBody?: { content: Record<string, { schema: unknown }> } }>
      >;
    };
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/auth/register',
        '/auth/login',
        '/auth/refresh',
        '/auth/logout',
        '/auth/me',
        '/health/ready',
      ]),
    );
    const registerSchema =
      doc.paths['/auth/register']?.['post']?.requestBody?.content['application/json']?.schema;
    expect(registerSchema).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['name', 'email', 'password']),
    });
  });

  it('serves Swagger UI at /docs', async () => {
    const res = await t.http().get('/docs').expect(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('returns the shared error shape for unknown routes', async () => {
    const res = await t.http().get('/nope').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found', code: 'not_found' });
  });
});
