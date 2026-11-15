import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Action, can } from '@teamboard/shared';
import { forbidden, notFound } from '../common/errors';
import { isId } from '../common/parse-id.pipe';
import { type AccessRequest, REQUIRED_ACTION, SCOPED_PARAMS, type ScopedParam } from './access.types';
import { WorkspaceResolver } from './workspace-resolver.service';

export function pickScopedParam(params: Record<string, unknown>): { kind: ScopedParam; id: unknown } | null {
  for (const kind of SCOPED_PARAMS) {
    const id = params[kind];
    if (id !== undefined) return { kind, id };
  }
  return null;
}

/**
 * Runs after AccessTokenGuard. Resolves the workspace that owns the most specific resource in the
 * route, then checks the caller's role there against the permission matrix.
 *
 * Unknown resource, malformed id, and "not a member" all produce the same 404, so ids from other
 * workspaces can't be probed. Members whose role is too low get 403.
 */
@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: WorkspaceResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<Action | undefined>(REQUIRED_ACTION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) throw new Error('WorkspaceRoleGuard used without @RequireRole(action)');

    const request = context.switchToHttp().getRequest<AccessRequest>();
    const userId = request.auth?.userId;
    if (!userId) throw new Error('WorkspaceRoleGuard must run after AccessTokenGuard');

    const scoped = pickScopedParam(request.params);
    if (!scoped) throw new Error(`Route for ${action} has no workspace-scoped id param`);
    if (!isId(scoped.id)) throw notFound();

    const workspaceId = await this.resolver.workspaceOf(scoped.kind, scoped.id);
    if (!workspaceId) throw notFound();

    const role = await this.resolver.roleOf(workspaceId, userId);
    if (!role) throw notFound();
    if (!can(role, action)) throw forbidden();

    request.access = { userId, workspaceId, role };
    return true;
  }
}
