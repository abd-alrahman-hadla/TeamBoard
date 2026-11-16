import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Action, Role } from '@teamboard/shared';
import { randomUUID } from 'node:crypto';
import type { AccessRequest, ScopedParam } from './access.types';
import { pickScopedParam, WorkspaceRoleGuard } from './workspace-role.guard';
import type { WorkspaceResolver } from './workspace-resolver.service';

const WORKSPACE = randomUUID();
const USER = randomUUID();

function setup(options: { action: Action; role: Role | null; owner?: string | null }) {
  const reflector = { getAllAndOverride: () => options.action } as unknown as Reflector;
  const workspaceOf = jest.fn((_kind: ScopedParam, _id: string) =>
    Promise.resolve(options.owner === undefined ? WORKSPACE : options.owner),
  );
  const roleOf = jest.fn(() => Promise.resolve(options.role));
  const resolver = { workspaceOf, roleOf } as unknown as WorkspaceResolver;
  return { guard: new WorkspaceRoleGuard(reflector, resolver), workspaceOf, roleOf };
}

function contextFor(
  params: Record<string, string>,
  headers: Record<string, string> = { 'x-client-id': 'tab-1' },
): { context: ExecutionContext; request: AccessRequest } {
  const request = { params, headers, auth: { userId: USER } } as unknown as AccessRequest;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('pickScopedParam', () => {
  it('prefers the most specific resource', () => {
    const ids = { workspaceId: 'w', boardId: 'b', columnId: 'c', cardId: 'k', commentId: 'm' };
    expect(pickScopedParam(ids)).toEqual({ kind: 'commentId', id: 'm' });
    expect(pickScopedParam({ workspaceId: 'w', boardId: 'b' })).toEqual({ kind: 'boardId', id: 'b' });
    expect(pickScopedParam({ workspaceId: 'w', userId: 'u' })).toEqual({ kind: 'workspaceId', id: 'w' });
    expect(pickScopedParam({ token: 't' })).toBeNull();
  });
});

describe('WorkspaceRoleGuard', () => {
  it('lets a sufficient role through and records the access context', async () => {
    const { guard, workspaceOf } = setup({ action: 'card.update', role: 'MEMBER' });
    const cardId = randomUUID();
    const { context, request } = contextFor({ cardId });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(workspaceOf).toHaveBeenCalledWith('cardId', cardId);
    expect(request.access).toEqual({
      userId: USER,
      workspaceId: WORKSPACE,
      role: 'MEMBER',
      clientId: 'tab-1',
    });
  });

  it('records a null client id when the header is missing or malformed', async () => {
    for (const headers of [{}, { 'x-client-id': '<script>' }]) {
      const { guard } = setup({ action: 'card.read', role: 'VIEWER' });
      const { context, request } = contextFor({ cardId: randomUUID() }, headers);
      await guard.canActivate(context);
      expect(request.access?.clientId).toBeNull();
    }
  });

  it('403s a member whose role is too low', async () => {
    const { guard } = setup({ action: 'board.delete', role: 'MEMBER' });
    await expect(guard.canActivate(contextFor({ boardId: randomUUID() }).context)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('404s a non-member, an unknown resource and a malformed id the same way', async () => {
    const nonMember = setup({ action: 'board.read', role: null });
    const unknown = setup({ action: 'board.read', role: 'OWNER', owner: null });
    const malformed = setup({ action: 'board.read', role: 'OWNER' });

    const results = await Promise.allSettled([
      nonMember.guard.canActivate(contextFor({ boardId: randomUUID() }).context),
      unknown.guard.canActivate(contextFor({ boardId: randomUUID() }).context),
      malformed.guard.canActivate(contextFor({ boardId: 'not-a-uuid' }).context),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({
        status: 'rejected',
        reason: { code: 'not_found', message: 'Not found' },
      });
    }
    expect(malformed.workspaceOf).not.toHaveBeenCalled();
  });
});
