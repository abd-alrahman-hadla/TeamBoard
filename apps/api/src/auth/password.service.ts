import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

// OWASP-recommended argon2id baseline (19 MiB, 2 passes, 1 lane).
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Verified against when the email is unknown, so "no such user" costs as much as "wrong password". */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Burns the same time as a real verification and always returns false. */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('teamboard-dummy-password');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
