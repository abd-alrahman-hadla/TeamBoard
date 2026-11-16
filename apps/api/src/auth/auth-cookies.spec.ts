import { refreshCookieOptions, sessionHintCookieOptions } from './auth-cookies';

const env = { COOKIE_SECURE: false, REFRESH_TOKEN_TTL_DAYS: 7, REFRESH_COOKIE_PATH: '/auth' } as const;

describe('auth cookie options', () => {
  it('scopes the refresh cookie to /auth, httpOnly, Lax, 7 days', () => {
    expect(refreshCookieOptions(env)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it('makes the session hint readable by the web app on every path', () => {
    expect(sessionHintCookieOptions(env)).toMatchObject({ httpOnly: false, path: '/', sameSite: 'lax' });
  });

  it('follows REFRESH_COOKIE_PATH when the API sits behind a path prefix', () => {
    expect(refreshCookieOptions({ ...env, REFRESH_COOKIE_PATH: '/api/auth' }).path).toBe('/api/auth');
  });

  it('adds Secure and Domain when configured', () => {
    const options = refreshCookieOptions({ ...env, COOKIE_SECURE: true, COOKIE_DOMAIN: '.example.com' });
    expect(options).toMatchObject({ secure: true, domain: '.example.com' });
  });
});
