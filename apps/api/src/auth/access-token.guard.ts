import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@teamboard/shared';
import type { Request } from 'express';
import { AppException } from '../common/app.exception';
import { TokenService } from './token.service';

export interface AuthContext {
  userId: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

export function readBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers.authorization);
    const payload = token ? await this.tokens.verifyAccessToken(token) : undefined;
    if (!payload) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.unauthorized,
        'Missing or invalid access token',
      );
    }
    request.auth = { userId: payload.sub };
    return true;
  }
}
