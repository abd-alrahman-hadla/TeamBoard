import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthContext, AuthenticatedRequest } from './access-token.guard';

/** The authenticated caller. Only valid on routes behind AccessTokenGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!auth) throw new Error('CurrentUser used on a route without AccessTokenGuard');
  return auth;
});
