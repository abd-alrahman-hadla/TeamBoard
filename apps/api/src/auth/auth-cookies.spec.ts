import { refreshCookieOptions, sessionHintCookieOptions } from './auth-cookies';

const env = { COOKIE_SECURE: false, REFRESH_TOKEN_TTL_DAYS: 7 } as const;

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

  it('adds Secure and Domain when configured', () => {
    const options = refreshCookieOptions({ ...env, COOKIE_SECURE: true, COOKIE_DOMAIN: '.example.com' });
    expect(options).toMatchObject({ secure: true, domain: '.example.com' });
  });
});
