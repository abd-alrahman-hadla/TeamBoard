/**
 * In-memory access token (never persisted: a reload gets a fresh one via silent refresh).
 * Browser-only state; nothing writes to it during server rendering.
 */
export interface AccessToken {
  value: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Lifetime in ms, used to schedule the proactive refresh. */
  lifetimeMs: number;
}

type Listener = (token: AccessToken | null) => void;

let current: AccessToken | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(current);
}

export const tokenStore = {
  get(): AccessToken | null {
    return current;
  },
  set(value: string, expiresInSeconds: number, now = Date.now()): void {
    const lifetimeMs = expiresInSeconds * 1000;
    current = { value, expiresAt: now + lifetimeMs, lifetimeMs };
    emit();
  },
  clear(): void {
    if (current === null) return;
    current = null;
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Refresh at 75% of the token's lifetime, so a request never goes out with an expiring token. */
export function msUntilProactiveRefresh(token: AccessToken, now = Date.now()): number {
  return Math.max(0, token.expiresAt - token.lifetimeMs * 0.25 - now);
}
