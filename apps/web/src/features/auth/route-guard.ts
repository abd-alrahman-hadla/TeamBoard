export const HOME_PATH = '/workspaces';
export const LOGIN_PATH = '/login';

const GUEST_PATHS = new Set(['/login', '/register']);

export function isGuestPath(pathname: string): boolean {
  return GUEST_PATHS.has(pathname);
}

/**
 * Only same-site relative paths are allowed as a post-login destination
 * (blocks open redirects like `//evil.com` or `/\evil.com`).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return HOME_PATH;
  return next;
}

export function loginPathFor(nextPath: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(nextPath)}`;
}

/**
 * Middleware decision. The session hint cookie only says "a session probably exists"; it is never trusted
 * for authorization. Guest pages are not redirected here (the client does it after a real refresh), so a
 * stale hint can never cause a redirect loop.
 */
export function getAuthRedirect(pathname: string, search: string, hasSessionHint: boolean): string | null {
  if (isGuestPath(pathname) || hasSessionHint) return null;
  return loginPathFor(`${pathname}${search}`);
}
