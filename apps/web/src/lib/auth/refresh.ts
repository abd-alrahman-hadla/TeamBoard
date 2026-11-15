import { type AuthResponse, authResponseSchema } from '@teamboard/shared';
import { env } from '../env';
import { tokenStore } from './token-store';

const REFRESH_LOCK = 'teamboard-auth-refresh';

let inFlight: Promise<AuthResponse | null> | null = null;

/**
 * Runs `task` while holding a cross-tab lock. Every tab shares the same refresh cookie, and the
 * server treats a second use of a rotated token as theft, so two tabs must never refresh at once.
 * Inside the lock each tab sends whatever cookie is current, which is always the newest one.
 */
async function withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    // lib.dom types this as Promise<Promise<T>>; awaiting unwraps both layers.
    return await navigator.locks.request(REFRESH_LOCK, task);
  }
  return task();
}

async function requestRefresh(): Promise<AuthResponse | null> {
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      tokenStore.clear();
      return null;
    }
    const body = authResponseSchema.parse(await response.json());
    tokenStore.set(body.accessToken, body.expiresIn);
    return body;
  } catch {
    tokenStore.clear();
    return null;
  }
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 * Concurrent callers in this tab share one request; other tabs wait for the lock.
 * Resolves to null when there is no valid session.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  inFlight ??= withCrossTabLock(requestRefresh).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
