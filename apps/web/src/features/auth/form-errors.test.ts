import { ApiError } from '@/lib/api-client';
import { toFormErrors } from './form-errors';

const FIELDS = ['name', 'email', 'password'] as const;

describe('toFormErrors', () => {
  it('puts email_taken on the email field', () => {
    expect(toFormErrors(new ApiError(409, 'email_taken', 'x'), FIELDS)).toEqual({
      fieldErrors: [{ field: 'email', message: 'An account with this email already exists.' }],
      formError: null,
    });
  });

  it('maps validation details onto known fields', () => {
    const error = new ApiError(400, 'validation_failed', 'Validation failed', [
      { path: 'password', message: 'Too short', code: 'too_small' },
      { path: 'unknown', message: 'ignored', code: 'custom' },
    ]);
    expect(toFormErrors(error, FIELDS).fieldErrors).toEqual([{ field: 'password', message: 'Too short' }]);
  });

  it('uses friendly form-level messages for credentials and rate limits', () => {
    expect(toFormErrors(new ApiError(401, 'invalid_credentials', 'x'), FIELDS).formError).toBe(
      'Invalid email or password.',
    );
    expect(toFormErrors(new ApiError(429, 'rate_limited', 'x'), FIELDS).formError).toMatch(
      /Too many attempts/,
    );
  });

  it('reports network failures', () => {
    expect(toFormErrors(new TypeError('Failed to fetch'), FIELDS).formError).toMatch(
      /Could not reach the server/,
    );
  });
});
