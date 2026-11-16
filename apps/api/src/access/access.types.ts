import type { Role } from '@teamboard/shared';
import type { AuthenticatedRequest } from '../auth/access-token.guard';

/** The caller's membership in the workspace that owns the requested resource. */
export interface AccessContext {
  userId: string;
  workspaceId: string;
  role: Role;
  /** X-Client-Id of the calling tab (null if absent or malformed). */
  clientId: string | null;
}

export interface AccessRequest extends AuthenticatedRequest {
  access?: AccessContext;
}

/** Route params the guard understands, most specific first. Every workspace-scoped route uses these names. */
export const SCOPED_PARAMS = ['commentId', 'cardId', 'columnId', 'boardId', 'workspaceId'] as const;
export type ScopedParam = (typeof SCOPED_PARAMS)[number];

/** Metadata key set by @RequireRole and read by WorkspaceRoleGuard. */
export const REQUIRED_ACTION = 'teamboard:required-action';
