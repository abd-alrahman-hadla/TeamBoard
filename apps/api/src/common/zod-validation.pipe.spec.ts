import { loginInputSchema } from '@teamboard/shared';
import { AppException } from './app.exception';
import { createZodDto } from './zod-dto';
import { ZodValidationPipe } from './zod-validation.pipe';

class LoginDto extends createZodDto(loginInputSchema) {}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('returns parsed (normalised) data for a Zod DTO', () => {
    const result = pipe.transform({ email: ' A@B.CO ', password: 'x' }, { type: 'body', metatype: LoginDto });
    expect(result).toEqual({ email: 'a@b.co', password: 'x' });
  });

  it('throws a 400 AppException with issue details on invalid input', () => {
    let thrown: unknown;
    try {
      pipe.transform({ email: 'nope' }, { type: 'body', metatype: LoginDto });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppException);
    const exception = thrown as AppException;
    expect(exception.getStatus()).toBe(400);
    expect(exception.code).toBe('validation_failed');
    expect(exception.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'email' }),
        expect.objectContaining({ path: 'password' }),
      ]),
    );
  });

  it('passes through values whose type is not a Zod DTO', () => {
    const value = { anything: true };
    expect(pipe.transform(value, { type: 'body', metatype: Object })).toBe(value);
    expect(pipe.transform('abc', { type: 'param' })).toBe('abc');
  });
});
