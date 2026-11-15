import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessContext, AccessRequest } from './access.types';

/** The caller's membership, resolved by @RequireRole. */
export const CurrentAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessContext => {
    const { access } = context.switchToHttp().getRequest<AccessRequest>();
    if (!access) throw new Error('CurrentAccess used on a route without @RequireRole');
    return access;
  },
);
