import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateOpaqueToken, hashOpaqueToken } from '../common/opaque-token';
import { type Env, InjectEnv } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
}

/** Refresh tokens are opaque 256-bit random values; only their SHA-256 is stored. */
export const generateRefreshToken = generateOpaqueToken;
export const hashRefreshToken = hashOpaqueToken;

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  return typeof value === 'object' && value !== null && 'sub' in value && typeof value.sub === 'string';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @InjectEnv() private readonly env: Env,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.env.ACCESS_TOKEN_TTL_SECONDS;
  }

  get refreshTokenTtlMs(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  signAccessToken(userId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId };
    return this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      algorithm: 'HS256',
    });
  }

  /** Returns the payload, or undefined when the token is missing, malformed, expired or forged. */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload | undefined> {
    const verified = await this.verifyWithExpiry(token);
    return verified ? { sub: verified.sub } : undefined;
  }

  /** Like verifyAccessToken, plus when it expires (epoch ms). Sockets disconnect at that moment. */
  async verifyWithExpiry(token: string): Promise<{ sub: string; expiresAt: number } | undefined> {
    try {
      const payload: unknown = await this.jwt.verifyAsync(token, {
        secret: this.env.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
      });
      if (!isAccessTokenPayload(payload)) return undefined;
      const exp = (payload as { exp?: unknown }).exp;
      return { sub: payload.sub, expiresAt: typeof exp === 'number' ? exp * 1000 : Date.now() };
    } catch {
      return undefined;
    }
  }
}
