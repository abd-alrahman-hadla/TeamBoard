import { Inject } from '@nestjs/common';
import { hostname } from 'node:os';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z.url(),
  WEB_ORIGIN: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32, { error: 'JWT_ACCESS_SECRET must be at least 32 characters' }),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z.stringbool().default(false),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  /** Path the refresh cookie is scoped to. Behind a proxy that mounts the API at /api, use /api/auth. */
  REFRESH_COOKIE_PATH: z
    .string()
    .regex(/^\/[\w\-/]*$/, { error: 'REFRESH_COOKIE_PATH must be an absolute path like /auth' })
    .default('/auth'),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(48),
  /** Socket.io Redis adapter (needed for 2+ instances). Unset = single-instance in-memory adapter. */
  REDIS_URL: z.url().optional(),
  /** Reported to clients (hello event, X-Instance-Id header) so multi-instance setups are observable. */
  INSTANCE_ID: z.string().min(1).default(hostname()),
  /** Set behind a reverse proxy so req.ip (rate limits, logs) is the client's address. */
  TRUST_PROXY: z.stringbool().default(false),
  SWAGGER_ENABLED: z.stringbool().default(true),
});

export type Env = z.infer<typeof envSchema>;
export type RawEnv = Record<string, string | undefined>;

/** Empty strings in .env files mean "not set". */
function dropEmpty(raw: RawEnv): RawEnv {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''));
}

export function parseEnv(raw: RawEnv): Env {
  const result = envSchema.safeParse(dropEmpty(raw));
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Parameter decorator: `constructor(@InjectEnv() private readonly env: Env)`. */
export const InjectEnv = (): ParameterDecorator => Inject(APP_CONFIG);
