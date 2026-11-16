import {
  type Notification,
  mentionToken,
  notificationPageSchema,
  SOCKET_EVENTS,
  unreadCountSchema,
} from '@teamboard/shared';
import { io, type Socket } from 'socket.io-client';
import { as, type Actor, seedWorld, type World } from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';

describe('notifications (integration)', () => {
  let t: TestApp;
  let w: World;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    t = await createTestApp({}, { listen: true });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    w = await seedWorld(t);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });

  const inbox = async (user: Actor) =>
    notificationPageSchema.parse((await as(t, user).get('/notifications').expect(200)).body).items;
  const unread = async (user: Actor) =>
    unreadCountSchema.parse((await as(t, user).get('/notifications/unread-count').expect(200)).body).count;

  describe('assignments', () => {
    it('notifies newly assigned people, not the person assigning', async () => {
      await as(t, w.users.owner)
        .patch(`/cards/${w.cardIds[1]}`, { assigneeIds: [w.users.member.id, w.users.owner.id] })
        .expect(200);

      const [notification] = await inbox(w.users.member);
      expect(notification).toMatchObject({
        type: 'ASSIGNED',
        actor: { id: w.users.owner.id },
        boardId: w.boardId,
        cardId: w.cardIds[1],
        cardTitle: 'Second',
        boardName: 'Board w',
        readAt: null,
      });
      expect(await inbox(w.users.owner)).toEqual([]);
    });

    it('does not repeat for people already assigned', async () => {
      const owner = as(t, w.users.owner);
      await owner.patch(`/cards/${w.cardIds[1]}`, { assigneeIds: [w.users.member.id] }).expect(200);
      await owner
        .patch(`/cards/${w.cardIds[1]}`, { assigneeIds: [w.users.member.id, w.users.admin.id] })
        .expect(200);
      await owner.patch(`/cards/${w.cardIds[1]}`, { title: 'No assignee change' }).expect(200);
      expect(await inbox(w.users.member)).toHaveLength(1);
      expect(await inbox(w.users.admin)).toHaveLength(1);
    });

    it('notifies assignees of a new card', async () => {
      await as(t, w.users.owner)
        .post(`/columns/${w.columnIds[0]}/cards`, { title: 'Fresh', assigneeIds: [w.users.viewer.id] })
        .expect(201);
      expect((await inbox(w.users.viewer))[0]).toMatchObject({ type: 'ASSIGNED', cardTitle: 'Fresh' });
    });
  });

  describe('mentions', () => {
    const comment = (body: string) => as(t, w.users.owner).post(`/cards/${w.cardIds[0]}/comments`, { body });

    it('notifies members mentioned in a comment, with an excerpt', async () => {
      await comment(`Can you check this, ${mentionToken('Member', w.users.member.id)}?`).expect(201);
      const [notification] = await inbox(w.users.member);
      expect(notification).toMatchObject({
        type: 'MENTIONED',
        cardTitle: 'First',
        excerpt: 'Can you check this, @Member?',
      });
      expect(notification?.commentId).toEqual(expect.any(String));
    });

    it('ignores self-mentions and people outside the workspace', async () => {
      await comment(
        `${mentionToken('Me', w.users.owner.id)} ${mentionToken('Stranger', w.users.outsider.id)}`,
      ).expect(201);
      expect(await inbox(w.users.owner)).toEqual([]);
      expect(await inbox(w.users.outsider)).toEqual([]);
    });

    it('editing a comment only notifies mentions that are new', async () => {
      const created = await comment(`Hi ${mentionToken('Member', w.users.member.id)}`).expect(201);
      await as(t, w.users.owner)
        .patch(`/comments/${created.body.id as string}`, {
          body: `Hi ${mentionToken('Member', w.users.member.id)} and ${mentionToken('Viewer', w.users.viewer.id)}`,
        })
        .expect(200);
      expect(await inbox(w.users.member)).toHaveLength(1);
      expect(await inbox(w.users.viewer)).toHaveLength(1);
    });
  });

  describe('reading', () => {
    beforeEach(async () => {
      await as(t, w.users.owner)
        .patch(`/cards/${w.cardIds[1]}`, { assigneeIds: [w.users.member.id] })
        .expect(200);
      await as(t, w.users.owner)
        .post(`/cards/${w.cardIds[0]}/comments`, { body: mentionToken('Member', w.users.member.id) })
        .expect(201);
    });

    it('counts unread, marks one and then all read', async () => {
      expect(await unread(w.users.member)).toBe(2);
      const [newest] = await inbox(w.users.member);
      expect(newest?.type).toBe('MENTIONED'); // newest first
      await as(t, w.users.member)
        .post(`/notifications/${newest?.id ?? ''}/read`)
        .expect(204);
      expect(await unread(w.users.member)).toBe(1);

      const unreadOnly = await as(t, w.users.member).get('/notifications?unreadOnly=true').expect(200);
      expect(notificationPageSchema.parse(unreadOnly.body).items.map((n) => n.type)).toEqual(['ASSIGNED']);

      await as(t, w.users.member).post('/notifications/read-all').expect(204);
      expect(await unread(w.users.member)).toBe(0);
    });

    it("can't read or mark someone else's notification", async () => {
      const [theirs] = await inbox(w.users.member);
      const res = await as(t, w.users.admin)
        .post(`/notifications/${theirs?.id ?? ''}/read`)
        .expect(404);
      expect(res.body.code).toBe('not_found');
      await as(t, w.users.admin).post('/notifications/not-an-id/read').expect(404);
      expect(await unread(w.users.member)).toBe(2);
      expect(await inbox(w.users.admin)).toEqual([]);
    });

    it('requires sign-in', async () => {
      await t.http().get('/notifications').expect(401);
      await t.http().get('/notifications/unread-count').expect(401);
    });

    it("drops a removed member's notifications for that workspace", async () => {
      await as(t, w.users.owner)
        .delete(`/workspaces/${w.workspaceId}/members/${w.users.member.id}`)
        .expect(204);
      expect(await inbox(w.users.member)).toEqual([]);
    });
  });

  it('delivers live to the recipient only', async () => {
    const connect = (user: Actor) =>
      new Promise<Socket>((resolve, reject) => {
        const socket = io(t.url, { transports: ['websocket'], forceNew: true, auth: { token: user.token } });
        sockets.push(socket);
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    const recipient = await connect(w.users.member);
    const bystander = await connect(w.users.admin);
    const got: Notification[] = [];
    const leaked: Notification[] = [];
    recipient.on(SOCKET_EVENTS.notification, (n: Notification) => got.push(n));
    bystander.on(SOCKET_EVENTS.notification, (n: Notification) => leaked.push(n));

    await as(t, w.users.owner)
      .patch(`/cards/${w.cardIds[1]}`, { assigneeIds: [w.users.member.id] })
      .expect(200);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: 'ASSIGNED', cardId: w.cardIds[1] });
    expect(leaked).toEqual([]);
  });
});
