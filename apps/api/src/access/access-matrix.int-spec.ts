import { type Action, can } from '@teamboard/shared';
import { randomUUID } from 'node:crypto';
import {
  ACTORS,
  type Actor,
  type ActorLabel,
  call,
  ROLE_OF,
  seedWorld,
  type World,
} from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface Case {
  action: Action;
  method: Method;
  path: (w: World, ctx: CaseContext) => string;
  body?: (w: World) => object;
  /** Status when the role is allowed. */
  ok: number;
  /** Per-role exceptions to "allowed by the matrix → ok, else 403". */
  override?: Partial<Record<ActorLabel, number>>;
  /** Extra per-test setup (e.g. a comment written by the acting user). */
  prepare?: (t: TestApp, w: World, actor: Actor) => Promise<CaseContext>;
}

interface CaseContext {
  ownCommentId?: string;
}

async function ownComment(t: TestApp, w: World, actor: Actor): Promise<CaseContext> {
  const comment = await t.prisma.comment.create({
    data: { cardId: w.cardIds[0], authorId: actor.id, body: 'mine' },
  });
  return { ownCommentId: comment.id };
}

const CASES: Case[] = [
  { action: 'workspace.read', method: 'get', path: (w) => `/workspaces/${w.workspaceId}`, ok: 200 },
  {
    action: 'workspace.update',
    method: 'patch',
    path: (w) => `/workspaces/${w.workspaceId}`,
    body: () => ({ name: 'Renamed' }),
    ok: 200,
  },
  { action: 'workspace.delete', method: 'delete', path: (w) => `/workspaces/${w.workspaceId}`, ok: 204 },
  {
    action: 'workspace.transferOwnership',
    method: 'post',
    path: (w) => `/workspaces/${w.workspaceId}/transfer-ownership`,
    body: (w) => ({ userId: w.users.target.id }),
    ok: 204,
  },
  {
    action: 'workspace.leave',
    method: 'post',
    path: (w) => `/workspaces/${w.workspaceId}/leave`,
    ok: 204,
    override: { owner: 403 },
  },
  { action: 'member.read', method: 'get', path: (w) => `/workspaces/${w.workspaceId}/members`, ok: 200 },
  {
    action: 'member.manage',
    method: 'patch',
    path: (w) => `/workspaces/${w.workspaceId}/members/${w.users.target.id}`,
    body: () => ({ role: 'VIEWER' }),
    ok: 200,
  },
  {
    action: 'member.manage',
    method: 'delete',
    path: (w) => `/workspaces/${w.workspaceId}/members/${w.users.target.id}`,
    ok: 204,
  },
  {
    action: 'invitation.read',
    method: 'get',
    path: (w) => `/workspaces/${w.workspaceId}/invitations`,
    ok: 200,
  },
  {
    action: 'invitation.create',
    method: 'post',
    path: (w) => `/workspaces/${w.workspaceId}/invitations`,
    body: () => ({ email: `new-${randomUUID().slice(0, 8)}@test.dev`, role: 'MEMBER' }),
    ok: 201,
  },
  {
    action: 'invitation.revoke',
    method: 'delete',
    path: (w) => `/workspaces/${w.workspaceId}/invitations/${w.invitationId}`,
    ok: 204,
  },
  { action: 'board.read', method: 'get', path: (w) => `/workspaces/${w.workspaceId}/boards`, ok: 200 },
  { action: 'board.read', method: 'get', path: (w) => `/boards/${w.boardId}`, ok: 200 },
  {
    action: 'board.create',
    method: 'post',
    path: (w) => `/workspaces/${w.workspaceId}/boards`,
    body: () => ({ name: 'New board' }),
    ok: 201,
  },
  {
    action: 'board.update',
    method: 'patch',
    path: (w) => `/boards/${w.boardId}`,
    body: () => ({ name: 'Renamed' }),
    ok: 200,
  },
  { action: 'board.delete', method: 'delete', path: (w) => `/boards/${w.boardId}`, ok: 204 },
  {
    action: 'column.create',
    method: 'post',
    path: (w) => `/boards/${w.boardId}/columns`,
    body: () => ({ name: 'Done' }),
    ok: 201,
  },
  {
    action: 'column.update',
    method: 'patch',
    path: (w) => `/columns/${w.columnIds[0]}`,
    body: () => ({ name: 'Backlog' }),
    ok: 200,
  },
  {
    action: 'column.move',
    method: 'post',
    path: (w) => `/columns/${w.columnIds[1]}/move`,
    body: () => ({ afterId: null }),
    ok: 200,
  },
  { action: 'column.delete', method: 'delete', path: (w) => `/columns/${w.columnIds[0]}`, ok: 204 },
  { action: 'card.read', method: 'get', path: (w) => `/cards/${w.cardIds[0]}`, ok: 200 },
  {
    action: 'card.create',
    method: 'post',
    path: (w) => `/columns/${w.columnIds[0]}/cards`,
    body: () => ({ title: 'New card' }),
    ok: 201,
  },
  {
    action: 'card.update',
    method: 'patch',
    path: (w) => `/cards/${w.cardIds[0]}`,
    body: () => ({ title: 'Edited', labels: ['bug'] }),
    ok: 200,
  },
  {
    action: 'card.move',
    method: 'post',
    path: (w) => `/cards/${w.cardIds[0]}/move`,
    body: (w) => ({ columnId: w.columnIds[1], afterId: null }),
    ok: 200,
  },
  { action: 'card.delete', method: 'delete', path: (w) => `/cards/${w.cardIds[0]}`, ok: 204 },
  { action: 'comment.read', method: 'get', path: (w) => `/cards/${w.cardIds[0]}/comments`, ok: 200 },
  {
    action: 'comment.create',
    method: 'post',
    path: (w) => `/cards/${w.cardIds[0]}/comments`,
    body: () => ({ body: 'Nice' }),
    ok: 201,
  },
  {
    action: 'comment.update',
    method: 'patch',
    path: (_w, ctx) => `/comments/${ctx.ownCommentId ?? ''}`,
    body: () => ({ body: 'Edited' }),
    ok: 200,
    prepare: ownComment,
  },
  {
    action: 'comment.delete',
    method: 'delete',
    path: (_w, ctx) => `/comments/${ctx.ownCommentId ?? ''}`,
    ok: 204,
    prepare: ownComment,
  },
  { action: 'activity.read', method: 'get', path: (w) => `/workspaces/${w.workspaceId}/activity`, ok: 200 },
  { action: 'activity.read', method: 'get', path: (w) => `/boards/${w.boardId}/activity`, ok: 200 },
];

/** Outsiders always get 404 (no existence leak); members get `ok` when the matrix allows, else 403. */
function expectedStatus(c: Case, actor: ActorLabel): number {
  const override = c.override?.[actor];
  if (override !== undefined) return override;
  if (actor === 'outsider') return 404;
  return can(ROLE_OF[actor], c.action) ? c.ok : 403;
}

describe('access matrix: every role × every endpoint (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe.each(CASES.map((c) => ({ ...c, name: `${c.method.toUpperCase()} ${c.action}` })))('$name', (c) => {
    it.each(ACTORS.map((actor) => ({ actor, status: expectedStatus(c, actor) })))(
      '$actor → $status',
      async ({ actor, status }) => {
        await resetDb(t.prisma);
        const world = await seedWorld(t);
        const user = world.users[actor];
        const ctx = c.prepare ? await c.prepare(t, world, user) : {};

        const res = await call(t, user, c.method, c.path(world, ctx), c.body?.(world));

        expect({ status: res.status, body: res.status >= 400 ? res.body : undefined }).toMatchObject({
          status,
        });
        if (status === 403) expect(res.body.code).toMatch(/forbidden|owner_protected/);
        if (status === 404)
          expect(res.body).toEqual({
            statusCode: 404,
            error: 'Not Found',
            code: 'not_found',
            message: 'Not found',
          });
      },
    );
  });

  it('every endpoint rejects anonymous callers with 401', async () => {
    await resetDb(t.prisma);
    const world = await seedWorld(t);
    for (const c of CASES) {
      const res = await call(
        t,
        null,
        c.method,
        c.path(world, { ownCommentId: world.commentId }),
        c.body?.(world),
      );
      expect({ route: `${c.method} ${c.action}`, status: res.status }).toEqual({
        route: `${c.method} ${c.action}`,
        status: 401,
      });
    }
  });

  describe('comment ownership rules on top of the matrix', () => {
    let world: World;

    beforeEach(async () => {
      await resetDb(t.prisma);
      world = await seedWorld(t);
    });

    // world.commentId is written by `member`.
    it.each<[ActorLabel, number]>([
      ['owner', 403],
      ['admin', 403],
      ['member', 200],
      ['viewer', 403],
    ])("%s editing member's comment → %i", async (actor, status) => {
      const res = await call(t, world.users[actor], 'patch', `/comments/${world.commentId}`, { body: 'x' });
      expect(res.status).toBe(status);
    });

    it.each<[ActorLabel, number]>([
      ['owner', 204],
      ['admin', 204],
      ['viewer', 403],
    ])("%s deleting member's comment → %i", async (actor, status) => {
      const res = await call(t, world.users[actor], 'delete', `/comments/${world.commentId}`);
      expect(res.status).toBe(status);
    });

    it("another member cannot delete member's comment", async () => {
      const res = await call(t, world.users.target, 'delete', `/comments/${world.commentId}`);
      expect(res.status).toBe(403);
    });
  });
});
