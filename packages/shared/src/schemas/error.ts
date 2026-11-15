import { z } from 'zod';

export const ERROR_CODES = {
  validationFailed: 'validation_failed',
  invalidCredentials: 'invalid_credentials',
  emailTaken: 'email_taken',
  unauthorized: 'unauthorized',
  refreshTokenInvalid: 'refresh_token_invalid',
  refreshTokenReused: 'refresh_token_reused',
  forbiddenOrigin: 'forbidden_origin',
  rateLimited: 'rate_limited',
  notFound: 'not_found',
  internal: 'internal_error',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const errorCodeSchema = z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
