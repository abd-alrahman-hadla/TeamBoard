import { createTestApp, type TestApp } from '../test-utils/test-app';

describe('HealthController (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /health/live is ok', async () => {
    await t.http().get('/health/live').expect(200, { status: 'ok' });
  });

  it('GET /health/ready checks the database', async () => {
    await t
      .http()
      .get('/health/ready')
      .expect(200, { status: 'ok', checks: { database: 'up' } });
  });

  it('GET /health/ready returns 503 when the database is unreachable', async () => {
    jest.spyOn(t.prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    const res = await t.http().get('/health/ready').expect(503);
    expect(res.body).toMatchObject({ statusCode: 503, message: 'Database is unreachable' });
  });
});
