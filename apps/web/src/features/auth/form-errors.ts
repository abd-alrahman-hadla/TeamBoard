import { ERROR_CODES } from '@teamboard/shared';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';

export interface FieldError {
  field: string;
  message: string;
}

export interface FormErrorResult {
  fieldErrors: FieldError[];
  formError: string | null;
}

const validationDetailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

const MESSAGES: Record<string, string> = {
  [ERROR_CODES.invalidCredentials]: 'Invalid email or password.',
  [ERROR_CODES.rateLimited]: 'Too many attempts. Please wait a minute and try again.',
};

/** Maps an API error onto form fields (when it names one) or a single form-level message. */
export function toFormErrors(error: unknown, fields: readonly string[]): FormErrorResult {
  if (!(error instanceof ApiError)) {
    return { fieldErrors: [], formError: 'Could not reach the server. Check your connection and try again.' };
  }
  if (error.code === ERROR_CODES.emailTaken && fields.includes('email')) {
    return {
      fieldErrors: [{ field: 'email', message: 'An account with this email already exists.' }],
      formError: null,
    };
  }
  if (error.code === ERROR_CODES.validationFailed) {
    const details = validationDetailsSchema.safeParse(error.details);
    const fieldErrors = details.success
      ? details.data
          .filter((d) => fields.includes(d.path))
          .map((d) => ({ field: d.path, message: d.message }))
      : [];
    if (fieldErrors.length > 0) return { fieldErrors, formError: null };
  }
  return { fieldErrors: [], formError: MESSAGES[error.code] ?? error.message };
}
