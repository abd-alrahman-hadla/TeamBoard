import { apiErrorSchema } from '@teamboard/shared';
import type { z } from 'zod';
import { refreshSession } from './auth/refresh';
import { tokenStore } from './auth/token-store';
import { env } from './env';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the access token and retry once after a silent refresh on 401. Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

async function toApiError(response: Response): Promise<ApiError> {
  const json: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(json);
  if (parsed.success) {
    return new ApiError(parsed.data.statusCode, parsed.data.code, parsed.data.message, parsed.data.details);
  }
  return new ApiError(response.status, 'http_error', response.statusText || 'Request failed');
}

function send(path: string, options: RequestOptions, accessToken: string | undefined): Promise<Response> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    cache: 'no-store',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

async function request(path: string, options: RequestOptions): Promise<Response> {
  const useAuth = options.auth ?? true;
  const response = await send(path, options, useAuth ? tokenStore.get()?.value : undefined);
  if (response.status !== 401 || !useAuth) return response;

  const session = await refreshSession();
  if (!session) return response;
  return send(path, options, session.accessToken);
}

/** Calls the API and validates the JSON response with `schema`. Throws ApiError on non-2xx. */
export async function apiJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: RequestOptions = {},
): Promise<z.output<TSchema>> {
  const response = await request(path, options);
  if (!response.ok) throw await toApiError(response);
  return schema.parse(await response.json());
}

/** Calls an endpoint that returns no body (204). Throws ApiError on non-2xx. */
export async function apiVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await request(path, options);
  if (!response.ok) throw await toApiError(response);
}
