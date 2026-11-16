import { AUTH_COOKIES } from '@teamboard/shared';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';

type CookieEnv = Pick<
  Env,
  'COOKIE_SECURE' | 'COOKIE_DOMAIN' | 'REFRESH_TOKEN_TTL_DAYS' | 'REFRESH_COOKIE_PATH'
>;

function baseOptions(env: CookieEnv): CookieOptions {
  return {
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function refreshCookieOptions(env: CookieEnv): CookieOptions {
  return {
    ...baseOptions(env),
    httpOnly: true,
    path: env.REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

/** Readable by the web app's middleware for redirects only. Carries no secret. */
export function sessionHintCookieOptions(env: CookieEnv): CookieOptions {
  return {
    ...baseOptions(env),
    httpOnly: false,
    path: '/',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function setAuthCookies(res: Response, env: CookieEnv, refreshToken: string): void {
  res.cookie(AUTH_COOKIES.refreshToken, refreshToken, refreshCookieOptions(env));
  res.cookie(AUTH_COOKIES.sessionHint, '1', sessionHintCookieOptions(env));
}

export function clearAuthCookies(res: Response, env: CookieEnv): void {
  const { maxAge: _a, ...refresh } = refreshCookieOptions(env);
  const { maxAge: _b, ...hint } = sessionHintCookieOptions(env);
  res.clearCookie(AUTH_COOKIES.refreshToken, refresh);
  res.clearCookie(AUTH_COOKIES.sessionHint, hint);
}
