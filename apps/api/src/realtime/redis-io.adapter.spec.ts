import type { INestApplicationContext } from '@nestjs/common';
import { RedisIoAdapter } from './redis-io.adapter';

const app = {} as INestApplicationContext;

describe('RedisIoAdapter.connect', () => {
  it('fails fast with a readable error instead of retrying forever', async () => {
    // Nothing listens on port 1, so node-redis would keep reconnecting without the timeout.
    const adapter = new RedisIoAdapter(app, {
      REDIS_URL: 'redis://:secret-password@127.0.0.1:1',
      WEB_ORIGIN: 'http://localhost:3000',
    });
    const started = Date.now();
    const error = await adapter.connect(500).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/Could not connect to Redis at 127\.0\.0\.1:1 within 0\.5s/);
    expect(String(error)).toMatch(/rediss:\/\//);
    expect(String(error)).not.toContain('secret-password');
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('skips Redis entirely without REDIS_URL', async () => {
    const adapter = new RedisIoAdapter(app, { WEB_ORIGIN: 'http://localhost:3000' });
    await expect(adapter.connect(500)).resolves.toBeUndefined();
  });
});
