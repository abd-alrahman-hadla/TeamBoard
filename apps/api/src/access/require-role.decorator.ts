import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Action } from '@teamboard/shared';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { REQUIRED_ACTION } from './access.types';
import { WorkspaceRoleGuard } from './workspace-role.guard';

/**
 * Requires the role that the permission matrix (`PERMISSIONS` in @teamboard/shared) assigns to `action`,
 * in the workspace that owns the route's resource (`:commentId` > `:cardId` > `:columnId` > `:boardId` > `:workspaceId`).
 */
export function RequireRole(action: Action): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(REQUIRED_ACTION, action),
    UseGuards(AccessTokenGuard, WorkspaceRoleGuard),
    ApiBearerAuth(),
  );
}
