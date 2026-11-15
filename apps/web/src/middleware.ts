import { AUTH_COOKIES } from '@teamboard/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { getAuthRedirect } from '@/features/auth/route-guard';

/**
 * Sends visitors without a session hint to /login before any protected page renders.
 * Real authorization happens in the API; the client re-checks with a silent refresh (RequireAuth).
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const redirectTo = getAuthRedirect(pathname, search, request.cookies.has(AUTH_COOKIES.sessionHint));
  return redirectTo ? NextResponse.redirect(new URL(redirectTo, request.url)) : NextResponse.next();
}

export const config = {
  // Everything except Next internals and files with an extension (favicon, images, ...).
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
