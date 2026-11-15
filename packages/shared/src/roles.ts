import { z } from 'zod';

export const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/** Roles that can be granted by invitation or role change. Ownership only moves by transfer. */
export const ASSIGNABLE_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES);

export const ROLE_RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

/**
 * The permission matrix: the minimum role for each action.
 * The API enforces it with @RequireRole(action); the web uses `can()` to hide what you can't do.
 */
export const PERMISSIONS = {
  'workspace.read': 'VIEWER',
  'workspace.leave': 'VIEWER',
  'workspace.update': 'OWNER',
  'workspace.delete': 'OWNER',
  'workspace.transferOwnership': 'OWNER',
  'member.read': 'VIEWER',
  'member.manage': 'ADMIN',
  'invitation.read': 'ADMIN',
  'invitation.create': 'ADMIN',
  'invitation.revoke': 'ADMIN',
  'board.read': 'VIEWER',
  'board.create': 'ADMIN',
  'board.update': 'ADMIN',
  'board.delete': 'ADMIN',
  'column.create': 'ADMIN',
  'column.update': 'ADMIN',
  'column.move': 'ADMIN',
  'column.delete': 'ADMIN',
  'card.read': 'VIEWER',
  'card.create': 'MEMBER',
  'card.update': 'MEMBER',
  'card.move': 'MEMBER',
  'card.delete': 'MEMBER',
  'comment.read': 'VIEWER',
  'comment.create': 'MEMBER',
  // Plus: only the author may edit; the author or an admin+ may delete (see canEditComment / canDeleteComment).
  'comment.update': 'MEMBER',
  'comment.delete': 'MEMBER',
  'activity.read': 'VIEWER',
} as const satisfies Record<string, Role>;

export type Action = keyof typeof PERMISSIONS;

export function hasAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function can(role: Role, action: Action): boolean {
  return hasAtLeast(role, PERMISSIONS[action]);
}

/** Owners and admins may invite as admin, member or viewer. Nobody is invited as owner. */
export function canInviteAs(actor: Role, role: Role): boolean {
  return role !== 'OWNER' && hasAtLeast(actor, 'ADMIN');
}

/**
 * Owner: may change anyone except the owner to admin/member/viewer.
 * Admin: may change members and viewers to admin/member/viewer, but never another admin or the owner.
 */
export function canChangeRole(actor: Role, target: Role, next: Role): boolean {
  if (next === 'OWNER' || target === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return target === 'MEMBER' || target === 'VIEWER';
  return false;
}

/** Owner removes anyone but themselves; admin removes members and viewers. */
export function canRemoveMember(actor: Role, target: Role): boolean {
  if (target === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return target === 'MEMBER' || target === 'VIEWER';
  return false;
}

export function canEditComment(actorId: string, authorId: string | null): boolean {
  return authorId !== null && actorId === authorId;
}

export function canDeleteComment(actorId: string, actorRole: Role, authorId: string | null): boolean {
  return canEditComment(actorId, authorId) || hasAtLeast(actorRole, 'ADMIN');
}
