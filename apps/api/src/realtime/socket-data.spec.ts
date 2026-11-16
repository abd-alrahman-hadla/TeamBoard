import { computePresence } from './socket-data';

describe('computePresence', () => {
  it('lists each user once, sorted, and groups editors per card', () => {
    const presence = computePresence('b1', [
      { userId: 'u2', name: 'Zed', editing: { boardId: 'b1', cardId: 'c1' } },
      { userId: 'u1', name: 'Ada', editing: null },
      { userId: 'u2', name: 'Zed', editing: { boardId: 'b1', cardId: 'c1' } }, // second tab
      { userId: 'u1', name: 'Ada', editing: { boardId: 'b1', cardId: 'c1' } },
    ]);
    expect(presence).toEqual({
      boardId: 'b1',
      viewers: [
        { userId: 'u1', name: 'Ada' },
        { userId: 'u2', name: 'Zed' },
      ],
      editing: { c1: ['u2', 'u1'] },
    });
  });

  it('ignores editing on another board', () => {
    const presence = computePresence('b1', [
      { userId: 'u1', name: 'Ada', editing: { boardId: 'b2', cardId: 'c9' } },
    ]);
    expect(presence.editing).toEqual({});
  });
});
