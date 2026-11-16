import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from './middleware';

describe('middleware matcher', () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it('guards app pages', () => {
    expect(matches('/workspaces')).toBe(true);
    expect(matches('/b/0196d000-0000-7000-8000-000000000002')).toBe(true);
  });

  it('never touches /api (proxied to the API), Next internals or static files', () => {
    expect(matches('/api/auth/login')).toBe(false);
    expect(matches('/api/auth/refresh')).toBe(false);
    expect(matches('/_next/static/chunk.js')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
  });
});
