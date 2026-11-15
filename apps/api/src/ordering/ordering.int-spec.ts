import { type BoardDetail, boardDetailSchema, cardSchema, comparePositions } from '@teamboard/shared';
import { as, seedWorld, type World } from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';

/** Deterministic PRNG so a failing random-move sequence can be replayed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ordering with fractional indexing (integration)', () => {
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

  const owner = () => as(t, w.users.owner);

  async function board(): Promise<BoardDetail> {
    const res = await owner().get(`/boards/${w.boardId}`).expect(200);
    return boardDetailSchema.parse(res.body);
  }

  async function cardIdsIn(columnId: string): Promise<string[]> {
    const detail = await board();
    return detail.columns.find((c) => c.id === columnId)?.cards.map((c) => c.id) ?? [];
  }

  async function addCard(columnId: string, title: string, afterId?: string | null): Promise<string> {
    const res = await owner()
      .post(`/columns/${columnId}/cards`, { title, ...(afterId !== undefined ? { afterId } : {}) })
      .expect(201);
    return cardSchema.parse(res.body).id;
  }

  it('places new cards first, last, or after a given card', async () => {
    const [todo] = w.columnIds;
    const [first, second] = w.cardIds;
    const last = await addCard(todo, 'last');
    const top = await addCard(todo, 'top', null);
    const middle = await addCard(todo, 'middle', first);
    expect(await cardIdsIn(todo)).toEqual([top, first, middle, second, last]);
  });

  it('places and reorders columns', async () => {
    const [todo, doing] = w.columnIds;
    const done = (await owner().post(`/boards/${w.boardId}/columns`, { name: 'Done' }).expect(201)).body
      .id as string;
    const backlog = (
      await owner().post(`/boards/${w.boardId}/columns`, { name: 'Backlog', afterId: null }).expect(201)
    ).body.id as string;
    expect((await board()).columns.map((c) => c.id)).toEqual([backlog, todo, doing, done]);

    await owner().post(`/columns/${done}/move`, { afterId: backlog }).expect(200);
    expect((await board()).columns.map((c) => c.id)).toEqual([backlog, done, todo, doing]);
  });

  it('a card move rewrites exactly one row', async () => {
    const [todo, doing] = w.columnIds;
    for (let i = 0; i < 5; i += 1) await addCard(doing, `d${i}`);

    const snapshot = async () =>
      (await t.prisma.card.findMany({ where: { boardId: w.boardId }, orderBy: { id: 'asc' } })).map((c) => ({
        id: c.id,
        columnId: c.columnId,
        position: c.position,
        version: c.version,
        updatedAt: c.updatedAt.getTime(),
      }));
    const before = await snapshot();
    const moved = w.cardIds[0];
    const anchor = (await cardIdsIn(doing))[2] ?? null;

    await owner().post(`/cards/${moved}/move`, { columnId: doing, afterId: anchor }).expect(200);

    const after = await snapshot();
    const changed = after.filter((row, i) => JSON.stringify(row) !== JSON.stringify(before[i]));
    expect(changed.map((c) => c.id)).toEqual([moved]);
    expect(changed[0]).toMatchObject({ columnId: doing });
    expect((await cardIdsIn(todo)).includes(moved)).toBe(false);
  });

  it('a column move rewrites exactly one row', async () => {
    const before = await t.prisma.column.findMany({ where: { boardId: w.boardId }, orderBy: { id: 'asc' } });
    await owner().post(`/columns/${w.columnIds[1]}/move`, { afterId: null }).expect(200);
    const after = await t.prisma.column.findMany({ where: { boardId: w.boardId }, orderBy: { id: 'asc' } });
    const changed = after.filter((row, i) => JSON.stringify(row) !== JSON.stringify(before[i]));
    expect(changed.map((c) => c.id)).toEqual([w.columnIds[1]]);
  });

  it('stays consistent over 60 random moves (API order == model order == byte order of keys)', async () => {
    const columns = [...w.columnIds];
    const model = new Map<string, string[]>([
      [columns[0] ?? '', [...w.cardIds]],
      [columns[1] ?? '', []],
    ]);
    for (let i = 0; i < 6; i += 1) {
      const columnId = columns[i % 2] ?? '';
      model.get(columnId)?.push(await addCard(columnId, `c${i}`));
    }

    const random = mulberry32(42);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

    for (let step = 0; step < 60; step += 1) {
      const all = [...model.entries()].flatMap(([columnId, ids]) => ids.map((id) => ({ id, columnId })));
      const card = pick(all);
      const target = pick(columns);
      // Remove from the model first: the anchor must not be the moving card.
      const source = model.get(card.columnId) ?? [];
      source.splice(source.indexOf(card.id), 1);
      const targetIds = model.get(target) ?? [];
      const anchor = targetIds.length > 0 && random() < 0.8 ? pick(targetIds) : null;

      await owner().post(`/cards/${card.id}/move`, { columnId: target, afterId: anchor }).expect(200);
      targetIds.splice(anchor === null ? 0 : targetIds.indexOf(anchor) + 1, 0, card.id);
    }

    const detail = await board();
    for (const column of detail.columns) {
      expect(column.cards.map((c) => c.id)).toEqual(model.get(column.id));
      const keys = column.cards.map((c) => c.position);
      expect([...keys].sort(comparePositions)).toEqual(keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps byte order where locale collation would not (keys like "Zz…" vs "a…")', async () => {
    const [todo] = w.columnIds;
    // Repeated inserts at the top walk the integer part down from "a0" into the "Z…" range.
    const tops: string[] = [];
    for (let i = 0; i < 4; i += 1) tops.unshift(await addCard(todo, `top${i}`, null));
    const detail = await board();
    const column = detail.columns.find((c) => c.id === todo);
    expect(column?.cards.map((c) => c.id)).toEqual([...tops, ...w.cardIds]);
    expect(column?.cards[0]?.position.startsWith('Z')).toBe(true);
  });

  it('20 concurrent appends to one column all succeed with distinct keys', async () => {
    const [, doing] = w.columnIds;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => owner().post(`/columns/${doing}/cards`, { title: `race ${i}` })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    const cards = await t.prisma.card.findMany({ where: { columnId: doing } });
    expect(new Set(cards.map((c) => c.position)).size).toBe(20);
  });

  it('concurrent moves of different cards to the same spot all succeed, in some order', async () => {
    const [todo, doing] = w.columnIds;
    const movers = await Promise.all(Array.from({ length: 6 }, (_, i) => addCard(todo, `m${i}`)));
    const results = await Promise.all(
      movers.map((id) => owner().post(`/cards/${id}/move`, { columnId: doing, afterId: null })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    const ids = await cardIdsIn(doing);
    expect([...ids].sort()).toEqual([...movers].sort());
  });

  it('concurrent column inserts on one board all succeed', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        owner().post(`/boards/${w.boardId}/columns`, { name: `col ${i}`, afterId: null }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect((await board()).columns).toHaveLength(12);
  });

  it('rejects placing a card after itself and anchors from another column', async () => {
    const [todo, doing] = w.columnIds;
    const [first, second] = w.cardIds;
    const self = await owner().post(`/cards/${first}/move`, { columnId: todo, afterId: first }).expect(400);
    expect(self.body.code).toBe('invalid_move');
    // `second` lives in todo, not doing.
    await owner().post(`/cards/${first}/move`, { columnId: doing, afterId: second }).expect(404);
    await owner().post(`/columns/${todo}/move`, { afterId: todo }).expect(400);
  });

  it('bumps version on every write', async () => {
    const [first] = w.cardIds;
    const v1 = (await owner().patch(`/cards/${first}`, { title: 'v2' }).expect(200)).body.version as number;
    const v2 = (
      await owner().post(`/cards/${first}/move`, { columnId: w.columnIds[1], afterId: null }).expect(200)
    ).body.version as number;
    expect([v1, v2]).toEqual([2, 3]);
  });
});
