import { describe, expect, it } from 'vitest';
import {
  type Action,
  can,
  canChangeRole,
  canDeleteComment,
  canEditComment,
  canInviteAs,
  canRemoveMember,
  PERMISSIONS,
  ROLES,
  type Role,
} from './roles';

// The expected matrix is written out by hand (not derived from PERMISSIONS) so a change to the
// permission table has to be made in two places on purpose.
// Columns: OWNER, ADMIN, MEMBER, VIEWER.
const EXPECTED: Record<Action, [boolean, boolean, boolean, boolean]> = {
  'workspace.read': [true, true, true, true],
  'workspace.leave': [true, true, true, true],
  'workspace.update': [true, false, false, false],
  'workspace.delete': [true, false, false, false],
  'workspace.transferOwnership': [true, false, false, false],
  'member.read': [true, true, true, true],
  'member.manage': [true, true, false, false],
  'invitation.read': [true, true, false, false],
  'invitation.create': [true, true, false, false],
  'invitation.revoke': [true, true, false, false],
  'board.read': [true, true, true, true],
  'board.create': [true, true, false, false],
  'board.update': [true, true, false, false],
  'board.delete': [true, true, false, false],
  'column.create': [true, true, false, false],
  'column.update': [true, true, false, false],
  'column.move': [true, true, false, false],
  'column.delete': [true, true, false, false],
  'card.read': [true, true, true, true],
  'card.create': [true, true, true, false],
  'card.update': [true, true, true, false],
  'card.move': [true, true, true, false],
  'card.delete': [true, true, true, false],
  'comment.read': [true, true, true, true],
  'comment.create': [true, true, true, false],
  'comment.update': [true, true, true, false],
  'comment.delete': [true, true, true, false],
  'activity.read': [true, true, true, true],
};

describe('permission matrix', () => {
  it('covers exactly the actions in PERMISSIONS', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(PERMISSIONS).sort());
  });

  const cases = (Object.entries(EXPECTED) as [Action, boolean[]][]).flatMap(([action, row]) =>
    ROLES.map((role, i) => ({ action, role, allowed: row[i] })),
  );

  it.each(cases)('$role → $action: $allowed', ({ action, role, allowed }) => {
    expect(can(role, action)).toBe(allowed);
  });

  it('viewers can only read (and leave)', () => {
    const viewerActions = (Object.keys(PERMISSIONS) as Action[]).filter((a) => can('VIEWER', a));
    expect(viewerActions.every((a) => a.endsWith('.read') || a === 'workspace.leave')).toBe(true);
  });
});

describe('rank rules', () => {
  const all: Role[] = [...ROLES];

  it('nobody can be invited as owner; owners and admins can invite the other roles', () => {
    for (const actor of all) {
      expect(canInviteAs(actor, 'OWNER')).toBe(false);
      for (const role of ['ADMIN', 'MEMBER', 'VIEWER'] as const) {
        expect(canInviteAs(actor, role)).toBe(actor === 'OWNER' || actor === 'ADMIN');
      }
    }
  });

  // [actor, target, next, allowed]
  const roleChanges: [Role, Role, Role, boolean][] = [];
  for (const actor of all) {
    for (const target of all) {
      for (const next of all) {
        let allowed = false;
        if (next !== 'OWNER' && target !== 'OWNER') {
          if (actor === 'OWNER') allowed = true;
          if (actor === 'ADMIN') allowed = target === 'MEMBER' || target === 'VIEWER';
        }
        roleChanges.push([actor, target, next, allowed]);
      }
    }
  }

  it.each(roleChanges)('%s changes %s → %s: %s', (actor, target, next, allowed) => {
    expect(canChangeRole(actor, target, next)).toBe(allowed);
  });

  it.each<[Role, Role, boolean]>([
    ['OWNER', 'OWNER', false],
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'MEMBER', true],
    ['OWNER', 'VIEWER', true],
    ['ADMIN', 'OWNER', false],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'MEMBER', true],
    ['ADMIN', 'VIEWER', true],
    ['MEMBER', 'MEMBER', false],
    ['MEMBER', 'VIEWER', false],
    ['VIEWER', 'VIEWER', false],
  ])('%s removes %s: %s', (actor, target, allowed) => {
    expect(canRemoveMember(actor, target)).toBe(allowed);
  });
});

describe('comment rules', () => {
  it('only the author edits', () => {
    expect(canEditComment('u1', 'u1')).toBe(true);
    expect(canEditComment('u1', 'u2')).toBe(false);
    expect(canEditComment('u1', null)).toBe(false);
  });

  it('the author or an admin+ deletes', () => {
    expect(canDeleteComment('u1', 'MEMBER', 'u1')).toBe(true);
    expect(canDeleteComment('u1', 'MEMBER', 'u2')).toBe(false);
    expect(canDeleteComment('u1', 'ADMIN', 'u2')).toBe(true);
    expect(canDeleteComment('u1', 'OWNER', null)).toBe(true);
  });
});
