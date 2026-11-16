import { ERROR_CODES } from '@teamboard/shared';
import { ApiError } from './api-client';

const MESSAGES: Record<string, string> = {
  [ERROR_CODES.forbidden]: "You don't have permission to do that.",
  [ERROR_CODES.notFound]: 'That item no longer exists. The board has been refreshed.',
  [ERROR_CODES.invalidAssignee]: 'Assignees must be members of this workspace.',
  [ERROR_CODES.invalidMove]: "That move isn't possible.",
  [ERROR_CODES.rateLimited]: 'Too many requests. Please wait a moment.',
  [ERROR_CODES.unauthorized]: 'Your session has expired. Please sign in again.',
};

/** A short, user-facing explanation for a failed request (used in toasts). */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Your change was undone.',
): string {
  if (error instanceof ApiError)
    return MESSAGES[error.code] ?? (error.status >= 500 ? fallback : error.message);
  if (error instanceof TypeError) return "Couldn't reach the server. Your change was undone.";
  return fallback;
}
