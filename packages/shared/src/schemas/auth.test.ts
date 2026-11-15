import { describe, expect, it } from 'vitest';
import { loginInputSchema, registerInputSchema } from './auth';

describe('registerInputSchema', () => {
  it('normalises email and trims name', () => {
    const parsed = registerInputSchema.parse({
      name: '  Ada Lovelace ',
      email: '  Ada@Example.COM ',
      password: 'correct horse',
    });
    expect(parsed).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse' });
  });

  it('rejects short passwords with a readable message', () => {
    const result = registerInputSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Password must be at least 8 characters');
  });

  it('rejects invalid emails and empty names', () => {
    const result = registerInputSchema.safeParse({ name: '   ', email: 'nope', password: 'long enough' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['name', 'email']));
  });
});

describe('loginInputSchema', () => {
  it('accepts any non-empty password', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
