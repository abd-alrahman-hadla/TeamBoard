import { can, type Role } from '@teamboard/shared';

export interface BoardPermissions {
  role: Role | null;
  /** Drag cards, add/edit/delete cards. */
  canEditCards: boolean;
  /** Add, rename, reorder and delete columns. */
  canManageColumns: boolean;
  canComment: boolean;
}

/** UI permissions from the shared matrix. The API enforces the same rules; this only hides what would fail. */
export function boardPermissions(role: Role | null): BoardPermissions {
  return {
    role,
    canEditCards: role !== null && can(role, 'card.update'),
    canManageColumns: role !== null && can(role, 'column.update'),
    canComment: role !== null && can(role, 'comment.create'),
  };
}

export const READ_ONLY: BoardPermissions = boardPermissions(null);
