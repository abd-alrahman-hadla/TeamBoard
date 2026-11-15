import { authBody, jsonResponse, mockFetch } from '@/test/fetch-mock';
import { refreshSession } from './refresh';
import { tokenStore } from './token-store';

describe('refreshSession', () => {
  afterEach(() => tokenStore.clear());

  it('posts to /auth/refresh with credentials and stores the new access token', async () => {
    const calls = mockFetch(() => jsonResponse(200, authBody('fresh')));
    const session = await refreshSession();
    expect(session?.user.email).toBe('ada@example.com');
    expect(tokenStore.get()?.value).toBe('fresh');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'http://api.test/auth/refresh',
      method: 'POST',
      credentials: 'include',
    });
  });

  it('shares one request between concurrent callers', async () => {
    const calls = mockFetch(() => jsonResponse(200, authBody('fresh')));
    const [a, b, c] = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(calls).toHaveLength(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('starts a new request once the previous one settled', async () => {
    const calls = mockFetch(
      () => jsonResponse(200, authBody('one')),
      () => jsonResponse(200, authBody('two')),
    );
    await refreshSession();
    await refreshSession();
    expect(calls).toHaveLength(2);
    expect(tokenStore.get()?.value).toBe('two');
  });

  it('returns null and clears the token when the server rejects the refresh', async () => {
    tokenStore.set('old', 900);
    mockFetch(() =>
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        code: 'refresh_token_reused',
        message: 'x',
      }),
    );
    await expect(refreshSession()).resolves.toBeNull();
    expect(tokenStore.get()).toBeNull();
  });

  it('returns null on a network error', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(refreshSession()).resolves.toBeNull();
  });
});
