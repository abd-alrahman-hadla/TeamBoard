import { vi } from 'vitest';

export interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  credentials: RequestCredentials | undefined;
}

type Responder = (call: RecordedCall) => Response | Promise<Response>;

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Replaces global fetch; responders are consumed in order. Returns the recorded calls. */
export function mockFetch(...responders: Responder[]): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const queue = [...responders];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL, init?: RequestInit) => {
      const call: RecordedCall = {
        url: input.toString(),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        credentials: init?.credentials,
      };
      calls.push(call);
      const next = queue.shift();
      if (!next) throw new Error(`Unexpected fetch ${call.method} ${call.url}`);
      return Promise.resolve(next(call));
    }),
  );
  return calls;
}

export const sampleUser = {
  id: '0194d6a4-6a8e-7cc5-9d1b-3f2a1b0c9d8e',
  email: 'ada@example.com',
  name: 'Ada',
  createdAt: '2026-11-15T10:00:00.000Z',
};

export function authBody(accessToken: string, expiresIn = 900) {
  return { accessToken, expiresIn, user: sampleUser };
}
