import type { ClientToServerEvents, ServerToClientEvents } from '@teamboard/shared';
import { SOCKET_EVENTS } from '@teamboard/shared';
import { io, type Socket } from 'socket.io-client';
import { refreshSession } from './auth/refresh';
import { tokenStore } from './auth/token-store';
import { env, socketUrl } from './env';

export type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: BoardSocket | null = null;
let reauthenticating = false;

/** Gets a fresh access token, then reconnects (after `auth:expired` or a rejected handshake). */
function reauthenticate(target: BoardSocket): void {
  if (reauthenticating) return;
  reauthenticating = true;
  void refreshSession()
    .then((session) => {
      if (session && !target.connected) target.connect();
    })
    .finally(() => {
      reauthenticating = false;
    });
}

function create(): BoardSocket {
  const url = socketUrl(env);
  const options = {
    // WebSocket only: no long-polling, so no sticky sessions behind a load balancer.
    transports: ['websocket'],
    autoConnect: false,
    // Evaluated on every (re)connect, so reconnects always use the current access token.
    auth: (cb: (data: object) => void) => cb({ token: tokenStore.get()?.value ?? '' }),
  };
  // No URL = this page's origin (the API is mounted behind the same host, e.g. nginx in docker-compose.prod.yml).
  const created: BoardSocket = url ? io(url, options) : io(options);

  created.on(SOCKET_EVENTS.expired, () => reauthenticate(created));
  created.on('connect_error', (error) => {
    // A rejected handshake isn't retried automatically by socket.io.
    if (error.message === 'unauthorized') reauthenticate(created);
  });
  // Signed out (or the session died): close the connection.
  tokenStore.subscribe((token) => {
    if (!token) created.disconnect();
  });

  if (process.env.NEXT_PUBLIC_E2E === '1' && typeof window !== 'undefined') {
    // Test seam for the reconnect e2e only (set at build time for Playwright).
    (window as unknown as { __teamboardSocket?: unknown }).__teamboardSocket = {
      disconnect: () => created.disconnect(),
      connect: () => created.connect(),
    };
  }
  return created;
}

/** One socket per tab, shared by every board view. */
export function getSocket(): BoardSocket {
  socket ??= create();
  return socket;
}

export function connectSocket(): BoardSocket {
  const current = getSocket();
  if (!current.connected && tokenStore.get()) current.connect();
  return current;
}
