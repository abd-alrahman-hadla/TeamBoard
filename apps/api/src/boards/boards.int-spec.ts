import {
  activityPageSchema,
  boardDetailSchema,
  cardSchema,
  commentSchema,
  myWorkspaceSchema,
} from '@teamboard/shared';
import { z } from 'zod';
import { as, seedWorld, type World } from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';

describe('workspaces, boards, cards & comments CRUD (integration)', () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    w = await seedWorld(t);
  });

  it('creating a workspace makes you its owner and logs it', async () => {
    const res = await as(t, w.users.outsider).post('/workspaces', { name: '  Side project ' }).expect(201);
    const workspace = myWorkspaceSchema.parse(res.body);
    expect(workspace).toMatchObject({ name: 'Side project', role: 'OWNER' });
    const list = await as(t, w.users.outsider).get('/workspaces').expect(200);
    expect(list.body).toEqual([workspace]);
    expect(
      await t.prisma.activity.count({ where: { workspaceId: workspace.id, action: 'workspace.created' } }),
    ).toBe(1);
  });

  it('deleting a workspace removes everything in it', async () => {
    await as(t, w.users.owner).delete(`/workspaces/${w.workspaceId}`).expect(204);
    const counts = await Promise.all([
      t.prisma.membership.count({ where: { workspaceId: w.workspaceId } }),
      t.prisma.board.count({ where: { workspaceId: w.workspaceId } }),
      t.prisma.card.count({ where: { boardId: w.boardId } }),
      t.prisma.comment.count({ where: { id: w.commentId } }),
      t.prisma.invitation.count({ where: { workspaceId: w.workspaceId } }),
      t.prisma.activity.count({ where: { workspaceId: w.workspaceId } }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('returns a whole board in one ordered payload', async () => {
    const res = await as(t, w.users.viewer).get(`/boards/${w.boardId}`).expect(200);
    const detail = boardDetailSchema.parse(res.body);
    expect(detail.columns.map((c) => c.name)).toEqual(['To do', 'Doing']);
    expect(detail.columns[0]?.cards.map((c) => c.title)).toEqual(['First', 'Second']);
  });

  it('creates and edits a card with every field', async () => {
    const created = await as(t, w.users.member)
      .post(`/columns/${w.columnIds[1]}/cards`, {
        title: 'Write docs',
        description: '## Plan\n- [ ] outline',
        labels: ['docs', 'p2'],
        dueDate: '2026-12-01T17:00:00+01:00',
        assigneeIds: [w.users.member.id, w.users.viewer.id],
      })
      .expect(201);
    const card = cardSchema.parse(created.body);
    expect(card).toMatchObject({
      columnId: w.columnIds[1],
      boardId: w.boardId,
      description: '## Plan\n- [ ] outline',
      labels: ['docs', 'p2'],
      dueDate: '2026-12-01T16:00:00.000Z',
      createdById: w.users.member.id,
      version: 1,
    });

    const edited = await as(t, w.users.member)
      .patch(`/cards/${card.id}`, { dueDate: null, labels: [], assigneeIds: [] })
      .expect(200);
    expect(edited.body).toMatchObject({
      dueDate: null,
      labels: [],
      assigneeIds: [],
      title: 'Write docs',
      version: 2,
    });
  });

  it('validates card input with per-field details', async () => {
    const res = await as(t, w.users.member)
      .post(`/columns/${w.columnIds[0]}/cards`, { title: '', labels: ['a', 'a'], dueDate: 'tomorrow' })
      .expect(400);
    expect((res.body.details as { path: string }[]).map((d) => d.path).sort()).toEqual([
      'dueDate',
      'labels',
      'title',
    ]);
    await as(t, w.users.member).patch(`/cards/${w.cardIds[0]}`, {}).expect(400);
  });

  it('deleting a column deletes its cards and their comments', async () => {
    await as(t, w.users.admin).delete(`/columns/${w.columnIds[0]}`).expect(204);
    expect(await t.prisma.card.count({ where: { id: { in: w.cardIds } } })).toBe(0);
    expect(await t.prisma.comment.count({ where: { id: w.commentId } })).toBe(0);
  });

  it('comments: list, add, edit own, delete', async () => {
    const added = await as(t, w.users.admin)
      .post(`/cards/${w.cardIds[0]}/comments`, { body: ' Looks good ' })
      .expect(201);
    expect(commentSchema.parse(added.body)).toMatchObject({
      body: 'Looks good',
      author: { id: w.users.admin.id },
    });

    const list = await as(t, w.users.viewer).get(`/cards/${w.cardIds[0]}/comments`).expect(200);
    expect(
      z
        .array(commentSchema)
        .parse(list.body)
        .map((c) => c.body),
    ).toEqual(['Hello', 'Looks good']);

    await as(t, w.users.admin)
      .patch(`/comments/${added.body.id as string}`, { body: 'Edited' })
      .expect(200);
    await as(t, w.users.admin)
      .delete(`/comments/${added.body.id as string}`)
      .expect(204);
  });

  it('logs every board change in order, paginated newest first', async () => {
    const owner = as(t, w.users.owner);
    await owner.patch(`/boards/${w.boardId}`, { name: 'Roadmap' }).expect(200);
    const column = await owner.post(`/boards/${w.boardId}/columns`, { name: 'Done' }).expect(201);
    const card = await owner
      .post(`/columns/${column.body.id as string}/cards`, { title: 'Ship' })
      .expect(201);
    await owner
      .post(`/cards/${card.body.id as string}/move`, { columnId: w.columnIds[0], afterId: null })
      .expect(200);
    await owner.post(`/cards/${card.body.id as string}/comments`, { body: 'Done!' }).expect(201);
    await owner.delete(`/cards/${card.body.id as string}`).expect(204);

    const page1 = activityPageSchema.parse(
      (await owner.get(`/boards/${w.boardId}/activity?limit=4`).expect(200)).body,
    );
    const page2 = activityPageSchema.parse(
      (await owner.get(`/boards/${w.boardId}/activity?limit=4&cursor=${page1.nextCursor ?? ''}`).expect(200))
        .body,
    );
    expect([...page1.items, ...page2.items].map((a) => a.action)).toEqual([
      'card.deleted',
      'comment.created',
      'card.moved',
      'card.created',
      'column.created',
      'board.updated',
    ]);
    expect(page2.nextCursor).toBeNull();
    expect(page1.items[0]?.actor).toEqual({ id: w.users.owner.id, name: w.users.owner.name });
  });

  it('logs board deletion at workspace level', async () => {
    await as(t, w.users.admin).delete(`/boards/${w.boardId}`).expect(204);
    const res = await as(t, w.users.viewer).get(`/workspaces/${w.workspaceId}/activity`).expect(200);
    expect(res.body.items[0]).toMatchObject({ action: 'board.deleted', boardId: null, entityId: w.boardId });
  });

  it('rejects bad activity paging params', async () => {
    await as(t, w.users.owner).get(`/boards/${w.boardId}/activity?limit=500`).expect(400);
    await as(t, w.users.owner).get(`/boards/${w.boardId}/activity?cursor=nope`).expect(400);
  });
});
