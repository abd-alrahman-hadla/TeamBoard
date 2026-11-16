import { cardByTitle, columnByName, makeBoard, titles } from '@/test/board-fixtures';
import {
  boardLabels,
  findCard,
  insertColumn,
  moveCardTo,
  moveColumnTo,
  patchCard,
  patchColumn,
  removeCard,
  removeColumn,
  replaceCard,
} from './board-cache';

const board = makeBoard({ Todo: ['a', 'b', 'c'], Doing: ['d'], Done: [] });

describe('moveCardTo', () => {
  it('reorders within a column', () => {
    const next = moveCardTo(board, cardByTitle(board, 'c').id, columnByName(board, 'Todo').id, null);
    expect(titles(next).Todo).toEqual(['c', 'a', 'b']);
  });

  it('moves after a card in another column', () => {
    const next = moveCardTo(
      board,
      cardByTitle(board, 'a').id,
      columnByName(board, 'Doing').id,
      cardByTitle(board, 'd').id,
    );
    expect(titles(next)).toEqual({ Todo: ['b', 'c'], Doing: ['d', 'a'], Done: [] });
    expect(findCard(next, cardByTitle(board, 'a').id)?.columnId).toBe(columnByName(board, 'Doing').id);
  });

  it('moves into an empty column', () => {
    const next = moveCardTo(board, cardByTitle(board, 'b').id, columnByName(board, 'Done').id, null);
    expect(titles(next).Done).toEqual(['b']);
  });

  it('does not mutate the input', () => {
    moveCardTo(board, cardByTitle(board, 'a').id, columnByName(board, 'Done').id, null);
    expect(titles(board).Todo).toEqual(['a', 'b', 'c']);
  });
});

describe('rollback by entity', () => {
  it('restores one card without undoing a later change to another card', () => {
    const a = cardByTitle(board, 'a');
    const b = cardByTitle(board, 'b');
    const done = columnByName(board, 'Done').id;
    // Two optimistic moves in flight; the first one fails.
    let state = moveCardTo(board, a.id, done, null);
    state = moveCardTo(state, b.id, done, a.id);
    state = replaceCard(state, a); // roll back `a` only
    expect(titles(state)).toEqual({ Todo: ['a', 'c'], Doing: ['d'], Done: ['b'] });
  });
});

describe('card edits', () => {
  it('patches fields in place and keeps order', () => {
    const next = patchCard(board, cardByTitle(board, 'b').id, { title: 'B!', labels: ['x'] });
    expect(titles(next).Todo).toEqual(['a', 'B!', 'c']);
  });

  it('removes a card', () => {
    expect(titles(removeCard(board, cardByTitle(board, 'd').id)).Doing).toEqual([]);
  });
});

describe('columns', () => {
  it('reorders columns', () => {
    const next = moveColumnTo(board, columnByName(board, 'Done').id, null);
    expect(next.columns.map((c) => c.name)).toEqual(['Done', 'Todo', 'Doing']);
    expect(titles(next).Todo).toEqual(['a', 'b', 'c']);
  });

  it('renames, inserts and removes', () => {
    let next = patchColumn(board, columnByName(board, 'Doing').id, { name: 'In progress' });
    expect(next.columns.map((c) => c.name)).toEqual(['Todo', 'In progress', 'Done']);
    const extra = {
      ...columnByName(board, 'Done'),
      id: 'c0000000-0000-4000-8000-000000000099',
      name: 'Later',
      position: 'a9',
      cards: [],
    };
    next = insertColumn(next, extra);
    expect(next.columns.map((c) => c.name)).toEqual(['Todo', 'In progress', 'Done', 'Later']);
    next = removeColumn(next, extra.id);
    expect(next.columns).toHaveLength(3);
  });
});

it('collects board labels sorted and unique', () => {
  let next = patchCard(board, cardByTitle(board, 'a').id, { labels: ['bug', 'ui'] });
  next = patchCard(next, cardByTitle(board, 'd').id, { labels: ['api', 'bug'] });
  expect(boardLabels(next)).toEqual(['api', 'bug', 'ui']);
});
