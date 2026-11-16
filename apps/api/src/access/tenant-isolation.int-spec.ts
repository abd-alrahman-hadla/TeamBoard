import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { as, call, seedWorld, type World } from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface Route {
  method: Method;
  /** Builds the path from a set of ids (A's real ids, or random ones). */
  path: (ids: Ids) => string;
  body?: (ids: Ids) => object;
}

interface Ids {
  workspaceId: string;
  boardId: string;
  columnId: string;
  otherColumnId: string;
  cardId: string;
  commentId: string;
  invitationId: string;
  userId: string;
}

function idsOf(w: World): Ids {
  return {
    workspaceId: w.workspaceId,
    boardId: w.boardId,
    columnId: w.columnIds[0],
    otherColumnId: w.columnIds[1],
    cardId: w.cardIds[0],
    commentId: w.commentId,
    invitationId: w.invitationId,
    userId: w.users.target.id,
  };
}

function randomIds(): Ids {
  return {
    workspaceId: randomUUID(),
    boardId: randomUUID(),
    columnId: randomUUID(),
    otherColumnId: randomUUID(),
    cardId: randomUUID(),
    commentId: randomUUID(),
    invitationId: randomUUID(),
    userId: randomUUID(),
  };
}

/** Every workspace-scoped route in the API. */
const ROUTES: Route[] = [
  { method: 'get', path: (i) => `/workspaces/${i.workspaceId}` },
  { method: 'patch', path: (i) => `/workspaces/${i.workspaceId}`, body: () => ({ name: 'Mine now' }) },
  { method: 'delete', path: (i) => `/workspaces/${i.workspaceId}` },
  {
    method: 'post',
    path: (i) => `/workspaces/${i.workspaceId}/transfer-ownership`,
    body: (i) => ({ userId: i.userId }),
  },
  { method: 'post', path: (i) => `/workspaces/${i.workspaceId}/leave` },
  { method: 'get', path: (i) => `/workspaces/${i.workspaceId}/members` },
  {
    method: 'patch',
    path: (i) => `/workspaces/${i.workspaceId}/members/${i.userId}`,
    body: () => ({ role: 'ADMIN' }),
  },
  { method: 'delete', path: (i) => `/workspaces/${i.workspaceId}/members/${i.userId}` },
  { method: 'get', path: (i) => `/workspaces/${i.workspaceId}/invitations` },
  {
    method: 'post',
    path: (i) => `/workspaces/${i.workspaceId}/invitations`,
    body: () => ({ email: 'spy@test.dev', role: 'ADMIN' }),
  },
  { method: 'delete', path: (i) => `/workspaces/${i.workspaceId}/invitations/${i.invitationId}` },
  { method: 'get', path: (i) => `/workspaces/${i.workspaceId}/activity` },
  { method: 'get', path: (i) => `/workspaces/${i.workspaceId}/boards` },
  { method: 'post', path: (i) => `/workspaces/${i.workspaceId}/boards`, body: () => ({ name: 'Planted' }) },
  { method: 'get', path: (i) => `/boards/${i.boardId}` },
  { method: 'patch', path: (i) => `/boards/${i.boardId}`, body: () => ({ name: 'Hijacked' }) },
  { method: 'delete', path: (i) => `/boards/${i.boardId}` },
  { method: 'get', path: (i) => `/boards/${i.boardId}/activity` },
  { method: 'post', path: (i) => `/boards/${i.boardId}/columns`, body: () => ({ name: 'Planted' }) },
  { method: 'patch', path: (i) => `/columns/${i.columnId}`, body: () => ({ name: 'Hijacked' }) },
  { method: 'post', path: (i) => `/columns/${i.columnId}/move`, body: () => ({ afterId: null }) },
  { method: 'delete', path: (i) => `/columns/${i.columnId}` },
  { method: 'post', path: (i) => `/columns/${i.columnId}/cards`, body: () => ({ title: 'Planted' }) },
  { method: 'get', path: (i) => `/cards/${i.cardId}` },
  { method: 'patch', path: (i) => `/cards/${i.cardId}`, body: () => ({ title: 'Hijacked' }) },
  {
    method: 'post',
    path: (i) => `/cards/${i.cardId}/move`,
    body: (i) => ({ columnId: i.otherColumnId, afterId: null }),
  },
  { method: 'delete', path: (i) => `/cards/${i.cardId}` },
  { method: 'get', path: (i) => `/cards/${i.cardId}/comments` },
  { method: 'get', path: (i) => `/cards/${i.cardId}/activity` },
  { method: 'post', path: (i) => `/cards/${i.cardId}/comments`, body: () => ({ body: 'Planted' }) },
  { method: 'patch', path: (i) => `/comments/${i.commentId}`, body: () => ({ body: 'Hijacked' }) },
  { method: 'delete', path: (i) => `/comments/${i.commentId}` },
];

const NOT_FOUND = { statusCode: 404, error: 'Not Found', code: 'not_found', message: 'Not found' };

describe('tenant isolation (integration)', () => {
  let t: TestApp;
  let a: World;
  let b: World;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    a = await seedWorld(t, 'a');
    b = await seedWorld(t, 'b');
  });

  async function snapshotA() {
    const [workspace, boards, columns, cards, comments, members, invitations] = await Promise.all([
      t.prisma.workspace.findUnique({ where: { id: a.workspaceId } }),
      t.prisma.board.findMany({ where: { workspaceId: a.workspaceId }, orderBy: { id: 'asc' } }),
      t.prisma.column.findMany({ where: { board: { workspaceId: a.workspaceId } }, orderBy: { id: 'asc' } }),
      t.prisma.card.findMany({ where: { board: { workspaceId: a.workspaceId } }, orderBy: { id: 'asc' } }),
      t.prisma.comment.findMany({
        where: { card: { board: { workspaceId: a.workspaceId } } },
        orderBy: { id: 'asc' },
      }),
      t.prisma.membership.findMany({ where: { workspaceId: a.workspaceId }, orderBy: { userId: 'asc' } }),
      t.prisma.invitation.findMany({ where: { workspaceId: a.workspaceId }, orderBy: { id: 'asc' } }),
    ]);
    return { workspace, boards, columns, cards, comments, members, invitations };
  }

  it("answers every one of A's routes for B's owner exactly like a random id would, and changes nothing", async () => {
    const before = await snapshotA();
    const real = idsOf(a);
    const fake = randomIds();

    for (const route of ROUTES) {
      const label = `${route.method.toUpperCase()} ${route.path(real)}`;
      const guessed = await call(t, b.users.owner, route.method, route.path(real), route.body?.(real));
      const random = await call(t, b.users.owner, route.method, route.path(fake), route.body?.(fake));

      expect({ label, status: guessed.status, body: guessed.body }).toEqual({
        label,
        status: 404,
        body: NOT_FOUND,
      });
      expect(guessed.text).toBe(random.text);
    }

    expect(await snapshotA()).toEqual(before);
  });

  it('answers malformed ids with the same 404 (never a 500)', async () => {
    const malformed: Ids = {
      workspaceId: 'abc',
      boardId: '1',
      columnId: "x' OR 1=1 --",
      otherColumnId: 'nope',
      cardId: '00000000-0000-0000-0000-00000000000Z',
      commentId: '%00',
      invitationId: 'nope',
      userId: 'nope',
    };
    for (const route of ROUTES) {
      const res = await call(t, b.users.owner, route.method, route.path(malformed), route.body?.(malformed));
      expect({ route: route.path(malformed), status: res.status }).toEqual({
        route: route.path(malformed),
        status: 404,
      });
    }
  });

  it('lists only your own workspaces, boards and activity', async () => {
    const workspaces = await as(t, b.users.member).get('/workspaces').expect(200);
    expect(
      z
        .array(z.object({ id: z.string() }))
        .parse(workspaces.body)
        .map((w) => w.id),
    ).toEqual([b.workspaceId]);

    const boards = await as(t, b.users.member).get(`/workspaces/${b.workspaceId}/boards`).expect(200);
    expect(
      z
        .array(z.object({ id: z.string() }))
        .parse(boards.body)
        .map((x) => x.id),
    ).toEqual([b.boardId]);

    await as(t, a.users.owner).patch(`/boards/${a.boardId}`, { name: 'A secret' }).expect(200);
    const activity = await as(t, b.users.owner).get(`/workspaces/${b.workspaceId}/activity`).expect(200);
    expect(JSON.stringify(activity.body)).not.toContain(a.workspaceId);
  });

  describe('foreign ids smuggled in request bodies', () => {
    it("can't move a card into another workspace's column", async () => {
      const res = await as(t, b.users.owner)
        .post(`/cards/${b.cardIds[0]}/move`, { columnId: a.columnIds[0], afterId: null })
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect((await t.prisma.card.findUniqueOrThrow({ where: { id: b.cardIds[0] } })).columnId).toBe(
        b.columnIds[0],
      );
    });

    it("can't anchor a move or a new card on another workspace's card or column", async () => {
      await as(t, b.users.owner)
        .post(`/cards/${b.cardIds[0]}/move`, { columnId: b.columnIds[1], afterId: a.cardIds[0] })
        .expect(404);
      await as(t, b.users.owner)
        .post(`/columns/${b.columnIds[0]}/cards`, { title: 'x', afterId: a.cardIds[0] })
        .expect(404);
      await as(t, b.users.owner)
        .post(`/columns/${b.columnIds[0]}/move`, { afterId: a.columnIds[0] })
        .expect(404);
      await as(t, b.users.owner)
        .post(`/boards/${b.boardId}/columns`, { name: 'x', afterId: a.columnIds[0] })
        .expect(404);
    });

    it("can't assign a card to someone outside the workspace", async () => {
      const res = await as(t, b.users.owner)
        .patch(`/cards/${b.cardIds[0]}`, { assigneeIds: [a.users.member.id] })
        .expect(400);
      expect(res.body.code).toBe('invalid_assignee');
      await as(t, b.users.owner)
        .post(`/columns/${b.columnIds[0]}/cards`, { title: 'x', assigneeIds: [a.users.owner.id] })
        .expect(400);
    });

    it("can't reach A's members or invitations through B's routes", async () => {
      const ws = `/workspaces/${b.workspaceId}`;
      await as(t, b.users.owner).patch(`${ws}/members/${a.users.member.id}`, { role: 'VIEWER' }).expect(404);
      await as(t, b.users.owner).delete(`${ws}/members/${a.users.member.id}`).expect(404);
      await as(t, b.users.owner).post(`${ws}/transfer-ownership`, { userId: a.users.member.id }).expect(404);
      await as(t, b.users.owner).delete(`${ws}/invitations/${a.invitationId}`).expect(404);
      const invitation = await t.prisma.invitation.findUniqueOrThrow({ where: { id: a.invitationId } });
      expect(invitation.revokedAt).toBeNull();
      const membership = await t.prisma.membership.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: a.workspaceId, userId: a.users.member.id } },
      });
      expect(membership.role).toBe('MEMBER');
    });

    it("can't read activity of another workspace's board through your own workspace", async () => {
      // Board activity is scoped by the board's own workspace, so this is A's board → 404 for B.
      await as(t, b.users.owner).get(`/boards/${a.boardId}/activity`).expect(404);
    });
  });

  describe('a user who belongs to both workspaces', () => {
    beforeEach(async () => {
      await t.prisma.membership.create({
        data: { workspaceId: b.workspaceId, userId: a.users.member.id, role: 'MEMBER' },
      });
    });

    it('still cannot move cards or anchor across workspaces', async () => {
      const both = a.users.member;
      await as(t, both)
        .post(`/cards/${a.cardIds[0]}/move`, { columnId: b.columnIds[0], afterId: null })
        .expect(404);
      await as(t, both)
        .post(`/cards/${b.cardIds[0]}/move`, { columnId: a.columnIds[0], afterId: null })
        .expect(404);
      await as(t, both)
        .post(`/columns/${a.columnIds[0]}/cards`, { title: 'x', afterId: b.cardIds[0] })
        .expect(404);
    });

    it('cannot assign a member of B to a card in A', async () => {
      await as(t, a.users.member)
        .patch(`/cards/${a.cardIds[0]}`, { assigneeIds: [b.users.member.id] })
        .expect(400);
    });

    it('sees both workspaces in their list', async () => {
      const res = await as(t, a.users.member).get('/workspaces').expect(200);
      expect(
        z
          .array(z.object({ id: z.string() }))
          .parse(res.body)
          .map((w) => w.id)
          .sort(),
      ).toEqual([a.workspaceId, b.workspaceId].sort());
    });
  });

  it('cannot move a card to a column on another board of the same workspace', async () => {
    const otherBoard = await as(t, a.users.owner)
      .post(`/workspaces/${a.workspaceId}/boards`, { name: 'Other' })
      .expect(201);
    const otherColumn = await as(t, a.users.owner)
      .post(`/boards/${otherBoard.body.id as string}/columns`, { name: 'Elsewhere' })
      .expect(201);
    await as(t, a.users.member)
      .post(`/cards/${a.cardIds[0]}/move`, { columnId: otherColumn.body.id as string, afterId: null })
      .expect(404);
  });
});
