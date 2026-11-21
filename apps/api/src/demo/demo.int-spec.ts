import {
  AUTH_COOKIES,
  type BoardDetail,
  type BoardEvent,
  DEMO_ACCOUNTS,
  DEMO_BOARD_ID,
  DEMO_PASSWORD,
  DEMO_WORKSPACE_ID,
  SOCKET_EVENTS,
} from '@teamboard/shared';
import { io, type Socket } from 'socket.io-client';
import { type Actor, as, createActor } from '../test-utils/fixtures';
import {
  createTestApp,
  ORIGIN_HEADER,
  readSetCookie,
  refreshCookieHeader,
  resetDb,
  type TestApp,
} from '../test-utils/test-app';
import { resetDemo } from './demo-reset';

const [SARA] = DEMO_ACCOUNTS;

/** Signs in through the real endpoint: returns an actor plus the refresh cookie value. */
async function signIn(t: TestApp, email: string): Promise<{ actor: Actor; refreshToken: string }> {
  const res = await t.http().post('/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  const body = res.body as { accessToken: string; user: { id: string; name: string; email: string } };
  const refreshToken = readSetCookie(res.headers['set-cookie'], AUTH_COOKIES.refreshToken) ?? '';
  return { actor: { ...body.user, token: body.accessToken }, refreshToken };
}

/** Pretends the last reset happened long ago, so the cooldown doesn't apply. */
async function expireCooldown(t: TestApp): Promise<void> {
  await t.prisma.workspace.update({
    where: { id: DEMO_WORKSPACE_ID },
    data: { createdAt: new Date(Date.now() - 10 * 60_000) },
  });
}

async function board(t: TestApp, actor: Actor): Promise<BoardDetail> {
  return (await as(t, actor).get(`/boards/${DEMO_BOARD_ID}`).expect(200)).body as BoardDetail;
}

describe('POST /demo/reset (integration)', () => {
  describe('with DEMO_MODE off', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(async () => {
      await t.close();
    });

    it('is a 404, even for demo members', async () => {
      await resetDb(t.prisma);
      await resetDemo(t.prisma, { revokeSessions: true });
      const { actor } = await signIn(t, SARA.email);
      const res = await as(t, actor).post('/demo/reset').expect(404);
      expect(res.body.code).toBe('not_found');
    });
  });

  describe('with DEMO_MODE on', () => {
    let t: TestApp;
    let sara: Actor;
    let saraRefresh: string;
    const sockets: Socket[] = [];

    beforeAll(async () => {
      t = await createTestApp({ DEMO_MODE: 'true' }, { listen: true });
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await resetDb(t.prisma);
      await resetDemo(t.prisma, { revokeSessions: true });
      await expireCooldown(t);
      ({ actor: sara, refreshToken: saraRefresh } = await signIn(t, SARA.email));
    });
    afterEach(() => {
      for (const socket of sockets.splice(0)) socket.close();
    });

    it('restores the board and keeps everyone signed in', async () => {
      const before = await board(t, sara);
      const firstCard = before.columns[0]?.cards[0];
      if (!firstCard) throw new Error('demo board has no cards');
      await as(t, sara).patch(`/cards/${firstCard.id}`, { title: 'Vandalised' }).expect(200);
      await as(t, sara)
        .post(`/columns/${before.columns[0]?.id ?? ''}/cards`, { title: 'Spam card' })
        .expect(201);

      await as(t, sara).post('/demo/reset').expect(204);

      const after = await board(t, sara);
      const titles = after.columns.flatMap((c) => c.cards.map((card) => card.title));
      expect(titles).toContain(firstCard.title);
      expect(titles).not.toContain('Vandalised');
      expect(titles).not.toContain('Spam card');
      expect(titles).toHaveLength(before.columns.flatMap((c) => c.cards).length);

      // The person who clicked is still signed in (the nightly reset signs everyone out instead).
      await t
        .http()
        .post('/auth/refresh')
        .set(ORIGIN_HEADER)
        .set('Cookie', refreshCookieHeader(saraRefresh))
        .expect(200);
    });

    it('allows one reset per minute', async () => {
      await as(t, sara).post('/demo/reset').expect(204);
      const res = await as(t, sara).post('/demo/reset').expect(429);
      expect(res.body.code).toBe('rate_limited');
      expect(res.body.message).toMatch(/Try again in \d+ seconds/);
    });

    it('is a 404 for anyone outside the demo workspace', async () => {
      const outsider = await createActor(t, 'outsider');
      await as(t, outsider).post('/demo/reset').expect(404);
      await t.http().post('/demo/reset').expect(401);
    });

    it('tells everyone on the demo board to refetch', async () => {
      const socket = io(t.url, { transports: ['websocket'], forceNew: true, auth: { token: sara.token } });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      const joined = await socket.timeout(5000).emitWithAck(SOCKET_EVENTS.join, { boardId: DEMO_BOARD_ID });
      expect(joined).toMatchObject({ ok: true });

      const resync = new Promise<BoardEvent>((resolve) => {
        socket.on(SOCKET_EVENTS.event, (event: BoardEvent) => {
          if (event.type === 'board.resync') resolve(event);
        });
      });
      await as(t, sara).post('/demo/reset').expect(204);
      await expect(resync).resolves.toMatchObject({ type: 'board.resync', boardId: DEMO_BOARD_ID });
    });
  });
});
