import { cardDrop, columnDrop, findContainer, moveToContainer, reorderWithin, sameDrop } from './dnd-logic';

const order = { todo: ['a', 'b', 'c'], doing: ['d'], done: [] as string[] };

describe('findContainer', () => {
  it('finds columns and cards', () => {
    expect(findContainer(order, 'todo')).toBe('todo');
    expect(findContainer(order, 'd')).toBe('doing');
    expect(findContainer(order, 'zzz')).toBeUndefined();
  });
});

describe('moveToContainer', () => {
  it('inserts at the hovered card', () => {
    expect(moveToContainer(order, 'a', 'd')).toEqual({ todo: ['b', 'c'], doing: ['a', 'd'], done: [] });
  });

  it('appends when hovering the column body (including an empty column)', () => {
    expect(moveToContainer(order, 'b', 'done')).toEqual({ todo: ['a', 'c'], doing: ['d'], done: ['b'] });
    expect(moveToContainer(order, 'b', 'doing').doing).toEqual(['d', 'b']);
  });

  it('is a no-op within the same column', () => {
    expect(moveToContainer(order, 'a', 'c')).toBe(order);
  });
});

describe('reorderWithin', () => {
  it('moves down and up', () => {
    expect(reorderWithin(order, 'a', 'c').todo).toEqual(['b', 'c', 'a']);
    expect(reorderWithin(order, 'c', 'a').todo).toEqual(['c', 'a', 'b']);
  });

  it('dropping on its own column body moves to the end', () => {
    expect(reorderWithin(order, 'a', 'todo').todo).toEqual(['b', 'c', 'a']);
  });
});

describe('cardDrop', () => {
  it('reports the column and the card it now follows', () => {
    expect(cardDrop(order, 'a')).toEqual({ columnId: 'todo', afterId: null });
    expect(cardDrop(order, 'c')).toEqual({ columnId: 'todo', afterId: 'b' });
    expect(cardDrop(moveToContainer(order, 'b', 'done'), 'b')).toEqual({ columnId: 'done', afterId: null });
  });

  it('uses the visible neighbour when the list is filtered', () => {
    // Only a and c are visible in todo; b is hidden by a filter.
    expect(cardDrop({ todo: ['a', 'c'], doing: [] }, 'c')).toEqual({ columnId: 'todo', afterId: 'a' });
  });

  it('detects "nothing changed"', () => {
    expect(sameDrop(cardDrop(order, 'b'), { columnId: 'todo', afterId: 'a' })).toBe(true);
    expect(sameDrop(cardDrop(order, 'b'), { columnId: 'todo', afterId: null })).toBe(false);
  });
});

describe('columnDrop', () => {
  const columns = ['todo', 'doing', 'done'];
  it('returns the column the dragged one now follows', () => {
    expect(columnDrop(columns, 'done', 'todo')).toEqual({ afterId: null });
    expect(columnDrop(columns, 'todo', 'done')).toEqual({ afterId: 'done' });
    expect(columnDrop(columns, 'todo', 'doing')).toEqual({ afterId: 'doing' });
  });

  it('returns null when nothing moved', () => {
    expect(columnDrop(columns, 'todo', 'todo')).toBeNull();
  });
});
