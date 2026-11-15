import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AuthResponse,
  ERROR_CODES,
  type LoginInput,
  type RegisterInput,
  type User,
} from '@teamboard/shared';
import { AppException } from '../common/app.exception';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { type ClientMeta, RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';

export interface Session {
  body: AuthResponse;
  refreshToken: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

const USER_SELECT = { id: true, email: true, name: true, createdAt: true } as const;

export function toUserDto(user: UserRow): User {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const emailTaken = (): AppException =>
  new AppException(HttpStatus.CONFLICT, ERROR_CODES.emailTaken, 'An account with this email already exists');

const invalidCredentials = (): AppException =>
  new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.invalidCredentials, 'Invalid email or password');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async register(input: RegisterInput, meta: ClientMeta): Promise<Session> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash },
        select: USER_SELECT,
      });
      return await this.startSession(user, meta);
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<Session> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...USER_SELECT, passwordHash: true },
    });
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);
    if (!user || !valid) throw invalidCredentials();
    return this.startSession(user, meta);
  }

  async refresh(rawToken: string | undefined, meta: ClientMeta): Promise<Session> {
    if (!rawToken) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.refreshTokenInvalid,
        'Missing refresh token',
      );
    }
    const result = await this.refreshTokens.rotate(rawToken, meta);
    if (result.kind === 'reused') {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.refreshTokenReused,
        'Refresh token was already used. All sessions from this sign-in have been revoked.',
      );
    }
    if (result.kind === 'invalid') {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.refreshTokenInvalid,
        'Refresh token is invalid or expired',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: result.userId }, select: USER_SELECT });
    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.refreshTokenInvalid,
        'User no longer exists',
      );
    }
    return { body: await this.buildBody(user), refreshToken: result.refreshToken };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.refreshTokens.revokeFamilyOf(rawToken);
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) {
      throw new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.unauthorized, 'User no longer exists');
    }
    return toUserDto(user);
  }

  private async startSession(user: UserRow, meta: ClientMeta): Promise<Session> {
    const refreshToken = await this.refreshTokens.issue(user.id, meta);
    return { body: await this.buildBody(user), refreshToken };
  }

  private async buildBody(user: UserRow): Promise<AuthResponse> {
    return {
      accessToken: await this.tokens.signAccessToken(user.id),
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: toUserDto(user),
    };
  }
}
