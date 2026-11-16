import {
  type BoardEvent,
  boardEventSchema,
  CLIENT_ID_HEADER,
  type Presence,
  presenceSchema,
  SOCKET_EVENTS,
} from '@teamboard/shared';
import { io, type Socket } from 'socket.io-client';
import { as, type Actor, call, seedWorld, type World } from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';

const QUIET_MS = 400;

function connect(url: string, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      ...(token ? { auth: { token } } : {}),
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Resolves with the next `event` payload matching `match`. */
function next<T>(
  socket: Socket,
  event: string,
  match: (payload: T) => boolean = () => true,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    socket.on(event, handler);
  });
}

/** Everything `event` delivers from now on. */
function collect<T>(socket: Socket, event: string): T[] {
  const items: T[] = [];
  socket.on(event, (payload: T) => items.push(payload));
  return items;
}

const quiet = () => new Promise((resolve) => setTimeout(resolve, QUIET_MS));

async function join(socket: Socket, boardId: string) {
  return (await socket.emitWithAck(SOCKET_EVENTS.join, { boardId })) as { ok: boolean; code?: string };
}

const events = (socket: Socket) => collect<BoardEvent>(socket, SOCKET_EVENTS.event);
const presenceOf = (socket: Socket, match: (p: Presence) => boolean) =>
  next<Presence>(socket, SOCKET_EVENTS.presence, (p) => presenceSchema.parse(p) !== undefined && match(p));
const viewerIds = (p: Presence) => p.viewers.map((v) => v.userId).sort();

describe('BoardGateway (integration)', () => {
  let t: TestApp;
  let w: World;
  const sockets: Socket[] = [];

  const open = async (actor: Actor | undefined, url = t.url) => {
    const socket = await connect(url, actor?.token);
    sockets.push(socket);
    return socket;
  };

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

  it('two clients: one moves a card over REST, the other receives card.moved', async () => {
    const a = await open(w.users.member);
    const b = await open(w.users.target);
    expect(await join(a, w.boardId)).toEqual({ ok: true });
    expect(await join(b, w.boardId)).toEqual({ ok: true });

    const received = next<BoardEvent>(b, SOCKET_EVENTS.event, (e) => e.type === 'card.moved');
    const res = await call(t, w.users.member, 'post', `/cards/${w.cardIds[0]}/move`, {
      columnId: w.columnIds[1],
      afterId: null,
    })
      .set(CLIENT_ID_HEADER, 'tab-a')
      .expect(200);

    const event = boardEventSchema.parse(await received);
    expect(event).toMatchObject({
      type: 'card.moved',
      boardId: w.boardId,
      actorId: w.users.member.id,
      originClientId: 'tab-a', // lets tab A skip its own echo
      payload: {
        fromColumnId: w.columnIds[0],
        card: { id: w.cardIds[0], columnId: w.columnIds[1], position: res.body.position, version: 2 },
      },
    });
  });

  describe('authentication and membership', () => {
    it('refuses connections without a valid access token', async () => {
      await expect(connect(t.url)).rejects.toThrow('unauthorized');
      await expect(connect(t.url, 'not.a.jwt')).rejects.toThrow('unauthorized');
    });

    it('says hello with the instance id', async () => {
      const socket = io(t.url, {
        transports: ['websocket'],
        forceNew: true,
        auth: { token: w.users.member.token },
      });
      sockets.push(socket);
      await expect(next(socket, SOCKET_EVENTS.hello)).resolves.toEqual({
        instanceId: 'test',
        userId: w.users.member.id,
      });
    });

    it('treats a board outside your workspaces like a missing one, and sends it nothing', async () => {
      const outsider = await open(w.users.outsider);
      expect(await join(outsider, w.boardId)).toEqual({ ok: false, code: 'not_found' });
      expect(await join(outsider, '0195a000-0000-7000-8000-00000000dead')).toEqual({
        ok: false,
        code: 'not_found',
      });
      expect(await join(outsider, 'nope')).toEqual({ ok: false, code: 'not_found' });

      const leaked = events(outsider);
      await as(t, w.users.member).patch(`/cards/${w.cardIds[0]}`, { title: 'secret' }).expect(200);
      await quiet();
      expect(leaked).toEqual([]);
    });

    it('lets viewers listen', async () => {
      const viewer = await open(w.users.viewer);
      expect(await join(viewer, w.boardId)).toEqual({ ok: true });
      const got = next<BoardEvent>(viewer, SOCKET_EVENTS.event);
      await as(t, w.users.member).patch(`/cards/${w.cardIds[0]}`, { title: 'Hi' }).expect(200);
      expect((await got).type).toBe('card.updated');
    });
  });

  describe('events', () => {
    it('emits a typed event for every kind of write, in order', async () => {
      const viewer = await open(w.users.viewer);
      await join(viewer, w.boardId);
      const seen = events(viewer);
      const owner = as(t, w.users.owner);
      const [todo, doing] = w.columnIds;

      const card = (await owner.post(`/columns/${todo}/cards`, { title: 'New' }).expect(201)).body
        .id as string;
      await owner.patch(`/cards/${card}`, { labels: ['x'] }).expect(200);
      await owner.post(`/cards/${card}/move`, { columnId: doing, afterId: null }).expect(200);
      const comment = (await owner.post(`/cards/${card}/comments`, { body: 'Hi' }).expect(201)).body
        .id as string;
      await owner.patch(`/comments/${comment}`, { body: 'Edited' }).expect(200);
      await owner.delete(`/comments/${comment}`).expect(204);
      await owner.delete(`/cards/${card}`).expect(204);
      const column = (await owner.post(`/boards/${w.boardId}/columns`, { name: 'Done' }).expect(201)).body
        .id as string;
      await owner.patch(`/columns/${column}`, { name: 'Shipped' }).expect(200);
      await owner.post(`/columns/${column}/move`, { afterId: null }).expect(200);
      await owner.delete(`/columns/${column}`).expect(204);
      await owner.patch(`/boards/${w.boardId}`, { name: 'Renamed' }).expect(200);
      await owner.delete(`/boards/${w.boardId}`).expect(204);
      await quiet();

      expect(seen.map((e) => boardEventSchema.parse(e).type)).toEqual([
        'card.created',
        'card.updated',
        'card.moved',
        'comment.created',
        'comment.updated',
        'comment.deleted',
        'card.deleted',
        'column.created',
        'column.updated',
        'column.moved',
        'column.deleted',
        'board.updated',
        'board.deleted',
      ]);
      expect(seen.every((e) => e.boardId === w.boardId && e.actorId === w.users.owner.id)).toBe(true);
    });

    it('emits nothing for a rejected write', async () => {
      const member = await open(w.users.member);
      await join(member, w.boardId);
      const seen = events(member);
      await as(t, w.users.viewer).patch(`/cards/${w.cardIds[0]}`, { title: 'nope' }).expect(403);
      await as(t, w.users.member)
        .post(`/cards/${w.cardIds[0]}/move`, { columnId: w.columnIds[0], afterId: w.cardIds[0] })
        .expect(400);
      await quiet();
      expect(seen).toEqual([]);
    });

    it('stops sending a board’s events after leave', async () => {
      const member = await open(w.users.member);
      await join(member, w.boardId);
      member.emit(SOCKET_EVENTS.leave, { boardId: w.boardId });
      await quiet();
      const seen = events(member);
      await as(t, w.users.owner).patch(`/cards/${w.cardIds[0]}`, { title: 'x' }).expect(200);
      await quiet();
      expect(seen).toEqual([]);
    });
  });

  describe('presence', () => {
    it('tracks who is viewing and who is editing which card', async () => {
      const a = await open(w.users.member);
      const alone = presenceOf(a, (p) => p.viewers.length === 1);
      await join(a, w.boardId);
      expect(viewerIds(await alone)).toEqual([w.users.member.id]);

      const b = await open(w.users.viewer);
      const both = presenceOf(a, (p) => p.viewers.length === 2);
      await join(b, w.boardId);
      expect(viewerIds(await both)).toEqual([w.users.member.id, w.users.viewer.id].sort());

      const editing = presenceOf(b, (p) => Object.keys(p.editing).length > 0);
      a.emit(SOCKET_EVENTS.editing, { boardId: w.boardId, cardId: w.cardIds[0] });
      expect((await editing).editing).toEqual({ [w.cardIds[0]]: [w.users.member.id] });

      const stopped = presenceOf(b, (p) => Object.keys(p.editing).length === 0);
      a.emit(SOCKET_EVENTS.editing, { boardId: w.boardId, cardId: null });
      await stopped;

      const left = presenceOf(b, (p) => p.viewers.length === 1);
      a.close();
      expect(viewerIds(await left)).toEqual([w.users.viewer.id]);
    });

    it('ignores "editing" from viewers and for cards on other boards', async () => {
      const member = await open(w.users.member);
      const viewer = await open(w.users.viewer);
      await join(member, w.boardId);
      await join(viewer, w.boardId);
      await quiet();
      const updates = collect<Presence>(member, SOCKET_EVENTS.presence);

      viewer.emit(SOCKET_EVENTS.editing, { boardId: w.boardId, cardId: w.cardIds[0] });
      member.emit(SOCKET_EVENTS.editing, {
        boardId: w.boardId,
        cardId: '0195a000-0000-7000-8000-00000000beef',
      });
      await quiet();
      expect(updates.filter((p) => Object.keys(p.editing).length > 0)).toEqual([]);
    });

    it('counts a user with two tabs once', async () => {
      const tab1 = await open(w.users.member);
      const tab2 = await open(w.users.member);
      await join(tab1, w.boardId);
      const update = presenceOf(tab1, () => true);
      await join(tab2, w.boardId);
      expect((await update).viewers).toHaveLength(1);
    });
  });

  it('removing a member cuts off their live updates and refreshes boards they were assigned on', async () => {
    const removed = await open(w.users.target);
    const watcher = await open(w.users.member);
    await join(removed, w.boardId);
    await join(watcher, w.boardId);

    const revoked = next<{ workspaceId: string }>(removed, SOCKET_EVENTS.revoked);
    const resync = next<BoardEvent>(watcher, SOCKET_EVENTS.event, (e) => e.type === 'board.resync');
    await as(t, w.users.owner)
      .delete(`/workspaces/${w.workspaceId}/members/${w.users.target.id}`)
      .expect(204);
    expect(await revoked).toEqual({ workspaceId: w.workspaceId });
    await resync; // target was assigned to card 0

    const seen = events(removed);
    await as(t, w.users.owner).patch(`/cards/${w.cardIds[1]}`, { title: 'after removal' }).expect(200);
    await quiet();
    expect(seen).toEqual([]);
    expect(await join(removed, w.boardId)).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('BoardGateway token expiry (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ACCESS_TOKEN_TTL_SECONDS: '2' }, { listen: true });
    await resetDb(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('tells the client its token expired and disconnects it', async () => {
    const w = await seedWorld(t);
    const socket = await connect(t.url, w.users.member.token);
    const expired = next(socket, SOCKET_EVENTS.expired, () => true, 5000);
    const disconnected = next<string>(socket, 'disconnect', () => true, 5000);
    await expired;
    expect(await disconnected).toBe('io server disconnect');
  });
});

describe('BoardGateway across two API instances (integration)', () => {
  let one: TestApp;
  let two: TestApp;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    one = await createTestApp({ INSTANCE_ID: 'one' }, { listen: true });
    two = await createTestApp({ INSTANCE_ID: 'two' }, { listen: true });
    await resetDb(one.prisma);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await one.close();
    await two.close();
  });

  it('delivers events and presence across instances through Redis', async () => {
    const w = await seedWorld(one);
    const hello = (url: string, token: string) => {
      const socket = io(url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth: { token },
      });
      sockets.push(socket);
      return next<{ instanceId: string }>(socket, SOCKET_EVENTS.hello).then((h) => ({ socket, ...h }));
    };
    const a = await hello(one.url, w.users.member.token);
    const b = await hello(two.url, w.users.target.token);
    expect([a.instanceId, b.instanceId]).toEqual(['one', 'two']);

    await join(a.socket, w.boardId);
    const both = presenceOf(a.socket, (p) => p.viewers.length === 2);
    await join(b.socket, w.boardId);
    expect(viewerIds(await both)).toEqual([w.users.member.id, w.users.target.id].sort());

    // A write through instance two reaches the client connected to instance one.
    const received = next<BoardEvent>(a.socket, SOCKET_EVENTS.event, (e) => e.type === 'card.moved');
    await call(two, w.users.target, 'post', `/cards/${w.cardIds[0]}/move`, {
      columnId: w.columnIds[1],
      afterId: null,
    })
      .expect(200)
      .expect('X-Instance-Id', 'two');
    expect(await received).toMatchObject({
      actorId: w.users.target.id,
      payload: { card: { columnId: w.columnIds[1] } },
    });
  });
});
