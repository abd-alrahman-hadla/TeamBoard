import { describe, expect, it } from 'vitest';
import { BOARD_EVENT_TYPES, boardEventSchema, clientIdSchema, presenceSchema } from './realtime';

const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-11-16T10:00:00.000Z';
const base = { boardId: id(1), actorId: id(2), originClientId: 'tab-1', at };

const card = {
  id: id(3),
  boardId: id(1),
  columnId: id(4),
  title: 'Card',
  description: null,
  labels: [],
  dueDate: null,
  assigneeIds: [],
  position: 'a0',
  version: 2,
  createdById: null,
  createdAt: at,
  updatedAt: at,
};

describe('boardEventSchema', () => {
  it('lists every event type', () => {
    expect(BOARD_EVENT_TYPES).toEqual([
      'card.created',
      'card.updated',
      'card.moved',
      'card.deleted',
      'column.created',
      'column.updated',
      'column.moved',
      'column.deleted',
      'comment.created',
      'comment.updated',
      'comment.deleted',
      'board.updated',
      'board.deleted',
      'board.resync',
    ]);
  });

  it('parses a card move and rejects a payload of the wrong shape', () => {
    const moved = { ...base, type: 'card.moved', payload: { card, fromColumnId: id(5) } };
    expect(boardEventSchema.parse(moved)).toEqual(moved);
    expect(boardEventSchema.safeParse({ ...moved, payload: { cardId: id(3) } }).success).toBe(false);
  });

  it('allows server-initiated events without an origin client', () => {
    expect(
      boardEventSchema.safeParse({ ...base, originClientId: null, type: 'board.resync', payload: {} })
        .success,
    ).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(boardEventSchema.safeParse({ ...base, type: 'card.exploded', payload: {} }).success).toBe(false);
  });
});

describe('presenceSchema', () => {
  it('parses viewers and editing', () => {
    const presence = {
      boardId: id(1),
      viewers: [{ userId: id(2), name: 'Ada' }],
      editing: { [id(3)]: [id(2)] },
    };
    expect(presenceSchema.parse(presence)).toEqual(presence);
  });
});

describe('clientIdSchema', () => {
  it('accepts short url-safe ids only', () => {
    expect(clientIdSchema.safeParse('6f1c-tab_2').success).toBe(true);
    expect(clientIdSchema.safeParse('x'.repeat(65)).success).toBe(false);
    expect(clientIdSchema.safeParse('<script>').success).toBe(false);
  });
});
