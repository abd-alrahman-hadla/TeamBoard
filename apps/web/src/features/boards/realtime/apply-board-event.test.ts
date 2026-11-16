import type { BoardEvent, Comment } from '@teamboard/shared';
import { positionBetween } from '@teamboard/shared';
import { cardByTitle, columnByName, makeBoard, makeCard, titles } from '@/test/board-fixtures';
import { applyBoardEvent, applyCommentEvent, type BoardCacheEvent } from './apply-board-event';

const board = makeBoard({ Todo: ['a', 'b'], Done: [] });
const envelope = {
  boardId: board.id,
  actorId: '0195a000-0000-7000-8000-000000000009',
  originClientId: 'other-tab',
  at: '2026-11-16T10:00:00.000Z',
};
const ev = <T extends BoardCacheEvent['type']>(
  type: T,
  payload: Extract<BoardCacheEvent, { type: T }>['payload'],
) => ({ ...envelope, type, payload }) as Extract<BoardCacheEvent, { type: T }>;

describe('applyBoardEvent: cards', () => {
  it('applies a newer move, and ignores a stale or duplicate one', () => {
    const a = cardByTitle(board, 'a');
    const done = columnByName(board, 'Done');
    const moved = { ...a, columnId: done.id, position: 'a0', version: 2 };
    const next = applyBoardEvent(board, ev('card.moved', { card: moved, fromColumnId: a.columnId }));
    expect(titles(next)).toEqual({ Todo: ['b'], Done: ['a'] });

    // Same event again (or arriving after a newer local state) changes nothing.
    expect(applyBoardEvent(next, ev('card.moved', { card: moved, fromColumnId: a.columnId }))).toBe(next);
    const older = { ...a, title: 'old', version: 1 };
    expect(applyBoardEvent(next, ev('card.updated', { card: older }))).toBe(next);
  });

  it('inserts a created card in position order', () => {
    const todo = columnByName(board, 'Todo');
    const first = todo.cards[0]?.position ?? null;
    const created = makeCard({ columnId: todo.id, position: positionBetween(null, first), title: 'top' });
    expect(titles(applyBoardEvent(board, ev('card.created', { card: created }))).Todo).toEqual([
      'top',
      'a',
      'b',
    ]);
  });

  it('ignores a card whose column is not loaded', () => {
    const orphan = makeCard({ columnId: '0195a000-0000-7000-8000-0000000000ff', position: 'a0', title: 'x' });
    expect(applyBoardEvent(board, ev('card.created', { card: orphan }))).toBe(board);
  });

  it('deletes, and tolerates deleting twice', () => {
    const b = cardByTitle(board, 'b');
    const next = applyBoardEvent(board, ev('card.deleted', { cardId: b.id, columnId: b.columnId }));
    expect(titles(next).Todo).toEqual(['a']);
    expect(applyBoardEvent(next, ev('card.deleted', { cardId: b.id, columnId: b.columnId }))).toBe(next);
  });
});

describe('applyBoardEvent: columns and board', () => {
  it('creates, reorders, renames and deletes columns', () => {
    const done = columnByName(board, 'Done');
    const { cards: _cards, ...doneColumn } = done;
    let next = applyBoardEvent(
      board,
      ev('column.moved', { column: { ...doneColumn, position: 'Zz', version: 2 } }),
    );
    expect(next.columns.map((c) => c.name)).toEqual(['Done', 'Todo']);

    next = applyBoardEvent(
      next,
      ev('column.updated', { column: { ...doneColumn, position: 'Zz', name: 'Shipped', version: 3 } }),
    );
    expect(next.columns.map((c) => c.name)).toEqual(['Shipped', 'Todo']);

    const extra = {
      ...doneColumn,
      id: '0195a000-0000-7000-8000-0000000000aa',
      name: 'Later',
      position: 'b5',
      version: 1,
    };
    next = applyBoardEvent(next, ev('column.created', { column: extra }));
    expect(next.columns.map((c) => c.name)).toEqual(['Shipped', 'Todo', 'Later']);

    next = applyBoardEvent(next, ev('column.deleted', { columnId: extra.id }));
    expect(next.columns).toHaveLength(2);
  });

  it('renames the board only for a newer version', () => {
    const { columns: _columns, ...meta } = board;
    expect(
      applyBoardEvent(board, ev('board.updated', { board: { ...meta, name: 'New', version: 2 } })).name,
    ).toBe('New');
    expect(applyBoardEvent(board, ev('board.updated', { board: { ...meta, name: 'Old', version: 1 } }))).toBe(
      board,
    );
  });
});

describe('applyCommentEvent', () => {
  const comment: Comment = {
    id: '0195a000-0000-7000-8000-0000000000c1',
    cardId: '0195a000-0000-7000-8000-0000000000c2',
    author: null,
    body: 'hi',
    createdAt: envelope.at,
    updatedAt: envelope.at,
  };
  const event = (type: 'comment.created' | 'comment.updated', c: Comment) =>
    ({ ...envelope, type, payload: { comment: c } }) as Extract<BoardEvent, { type: 'comment.created' }>;

  it('appends once, updates and deletes', () => {
    let list = applyCommentEvent([], event('comment.created', comment));
    list = applyCommentEvent(list, event('comment.created', comment));
    expect(list).toHaveLength(1);
    list = applyCommentEvent(list, {
      ...event('comment.updated', { ...comment, body: 'edited' }),
      type: 'comment.updated',
    });
    expect(list[0]?.body).toBe('edited');
    list = applyCommentEvent(list, {
      ...envelope,
      type: 'comment.deleted',
      payload: { commentId: comment.id, cardId: comment.cardId },
    });
    expect(list).toEqual([]);
  });
});
