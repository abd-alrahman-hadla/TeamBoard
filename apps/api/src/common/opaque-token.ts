import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, base64url (43 chars). Used for refresh tokens and invitation links. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** A fast hash is enough for 256-bit random tokens, and it allows a unique-index lookup. */
export function hashOpaqueToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function isOpaqueToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
