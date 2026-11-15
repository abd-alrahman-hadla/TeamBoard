import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@teamboard/shared';
import type { Request } from 'express';
import { type Env, InjectEnv } from '../config/env';
import { AppException } from './app.exception';

/**
 * CSRF defence in depth for cookie-authenticated endpoints (refresh, logout):
 * the browser always sends Origin on cross-origin POSTs, and it must be the web app.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@InjectEnv() private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin !== new URL(this.env.WEB_ORIGIN).origin) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.forbiddenOrigin,
        'Request origin is not allowed',
      );
    }
    return true;
  }
}
