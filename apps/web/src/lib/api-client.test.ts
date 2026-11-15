import { userSchema } from '@teamboard/shared';
import { authBody, jsonResponse, mockFetch, sampleUser } from '@/test/fetch-mock';
import { ApiError, apiJson, apiVoid } from './api-client';
import { tokenStore } from './auth/token-store';

const unauthorized = {
  statusCode: 401,
  error: 'Unauthorized',
  code: 'unauthorized',
  message: 'Missing or invalid access token',
};

describe('apiJson', () => {
  afterEach(() => tokenStore.clear());

  it('sends the bearer token with credentials and validates the response', async () => {
    tokenStore.set('token-1', 900);
    const calls = mockFetch(() => jsonResponse(200, sampleUser));
    await expect(apiJson('/auth/me', userSchema)).resolves.toEqual(sampleUser);
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer token-1');
    expect(calls[0]?.credentials).toBe('include');
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    tokenStore.set('expired', 900);
    const calls = mockFetch(
      () => jsonResponse(401, unauthorized),
      () => jsonResponse(200, authBody('token-2')),
      () => jsonResponse(200, sampleUser),
    );
    await expect(apiJson('/auth/me', userSchema)).resolves.toEqual(sampleUser);
    expect(calls.map((c) => c.url)).toEqual([
      'http://api.test/auth/me',
      'http://api.test/auth/refresh',
      'http://api.test/auth/me',
    ]);
    expect(calls[2]?.headers.get('Authorization')).toBe('Bearer token-2');
  });

  it('gives up with an ApiError when the refresh fails', async () => {
    tokenStore.set('expired', 900);
    mockFetch(
      () => jsonResponse(401, unauthorized),
      () => jsonResponse(401, { ...unauthorized, code: 'refresh_token_invalid' }),
    );
    await expect(apiJson('/auth/me', userSchema)).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
    expect(tokenStore.get()).toBeNull();
  });

  it('does not retry more than once', async () => {
    tokenStore.set('expired', 900);
    const calls = mockFetch(
      () => jsonResponse(401, unauthorized),
      () => jsonResponse(200, authBody('token-2')),
      () => jsonResponse(401, unauthorized),
    );
    await expect(apiJson('/auth/me', userSchema)).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(3);
  });

  it('does not refresh for unauthenticated endpoints', async () => {
    const calls = mockFetch(() =>
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        code: 'invalid_credentials',
        message: 'Invalid email or password',
      }),
    );
    await expect(
      apiJson('/auth/login', userSchema, {
        method: 'POST',
        body: { email: 'a@b.co', password: 'x' },
        auth: false,
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('Content-Type')).toBe('application/json');
  });

  it('maps non-JSON errors to a generic ApiError', async () => {
    mockFetch(() => new Response('boom', { status: 502, statusText: 'Bad Gateway' }));
    await expect(apiJson('/x', userSchema, { auth: false })).rejects.toMatchObject({
      status: 502,
      code: 'http_error',
    });
  });
});

describe('apiVoid', () => {
  it('resolves on 204', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(apiVoid('/auth/logout', { method: 'POST', auth: false })).resolves.toBeUndefined();
  });
});
