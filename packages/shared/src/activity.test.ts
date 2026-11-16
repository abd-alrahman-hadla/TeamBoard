import { describe, expect, it } from 'vitest';
import { activityCardId, describeActivity } from './activity';
import type { Activity } from './schemas/board';

const lookup = {
  columnName: (id: string) => ({ c1: 'To do', c2: 'In progress' })[id],
  cardTitle: (id: string) => ({ k1: 'Current title' })[id],
};

function entry(
  action: string,
  data: Record<string, unknown>,
  entityType = 'card',
  entityId = 'k1',
): Activity {
  return {
    id: '0195a000-0000-7000-8000-000000000001',
    workspaceId: '0195a000-0000-7000-8000-000000000002',
    boardId: '0195a000-0000-7000-8000-000000000003',
    actor: { id: '0195a000-0000-7000-8000-000000000004', name: 'Sara' },
    entityType,
    entityId,
    action,
    data,
    createdAt: '2026-11-16T10:00:00.000Z',
  };
}

describe('describeActivity', () => {
  const moved = entry('card.moved', {
    cardTitle: 'Login page',
    fromColumnId: 'c1',
    fromColumnName: 'To do',
    toColumnId: 'c2',
    toColumnName: 'In progress',
  });

  it('writes the board sentence from snapshots', () => {
    expect(describeActivity(moved, 'board', lookup)).toBe(
      "Sara moved 'Login page' from To do to In progress",
    );
  });

  it('writes the card sentence in card scope', () => {
    expect(describeActivity(moved, 'card', lookup)).toBe('Sara moved this card from To do to In progress');
  });

  it('prefers snapshots over current names (history survives renames)', () => {
    const renamedSince = { columnName: () => 'Backlog', cardTitle: () => 'Renamed card' };
    expect(describeActivity(moved, 'board', renamedSince)).toBe(
      "Sara moved 'Login page' from To do to In progress",
    );
  });

  it('falls back to current names for rows recorded before snapshots existed', () => {
    const legacy = entry('card.moved', { fromColumnId: 'c1', toColumnId: 'c2' });
    expect(describeActivity(legacy, 'board', lookup)).toBe(
      "Sara moved 'Current title' from To do to In progress",
    );
    const gone = entry('card.moved', { fromColumnId: 'zz', toColumnId: 'c2' }, 'card', 'unknown');
    expect(describeActivity(gone, 'board', lookup)).toBe(
      "Sara moved 'a card' from a deleted column to In progress",
    );
  });

  it.each([
    [
      entry('card.created', { cardTitle: 'Login page', columnId: 'c1', columnName: 'To do' }),
      "Sara added 'Login page' to To do",
      'Sara created this card in To do',
    ],
    [
      entry('card.updated', { cardTitle: 'New', previousTitle: 'Old', fields: ['title'] }),
      "Sara renamed 'Old' to 'New'",
      "Sara renamed this card from 'Old' to 'New'",
    ],
    [
      entry('card.updated', { cardTitle: 'X', fields: ['labels', 'dueDate'] }),
      "Sara updated the labels and the due date of 'X'",
      'Sara updated the labels and the due date',
    ],
    [
      entry('card.moved', {
        cardTitle: 'X',
        fromColumnId: 'c2',
        toColumnId: 'c2',
        toColumnName: 'In progress',
      }),
      "Sara reordered 'X' in In progress",
      'Sara reordered this card in In progress',
    ],
    [entry('card.deleted', { cardTitle: 'X' }), "Sara deleted 'X'", 'Sara deleted this card'],
    [
      entry('comment.created', { cardId: 'k1', cardTitle: 'X' }, 'comment', 'm1'),
      "Sara commented on 'X'",
      'Sara commented',
    ],
  ])('%#', (activity, board, card) => {
    expect(describeActivity(activity, 'board', lookup)).toBe(board);
    expect(describeActivity(activity, 'card', lookup)).toBe(card);
  });

  it('describes column events', () => {
    expect(
      describeActivity(entry('column.created', { name: 'Review' }, 'column', 'c3'), 'board', lookup),
    ).toBe('Sara added the column Review');
    expect(
      describeActivity(
        entry('column.updated', { name: 'QA', previousName: 'Review' }, 'column', 'c3'),
        'board',
        lookup,
      ),
    ).toBe('Sara renamed the column Review to QA');
    expect(describeActivity(entry('column.moved', {}, 'column', 'c1'), 'board', lookup)).toBe(
      'Sara moved the column To do',
    );
  });

  it('finds the card an entry is about', () => {
    expect(activityCardId(moved)).toBe('k1');
    expect(activityCardId(entry('comment.created', { cardId: 'k9' }, 'comment', 'm1'))).toBe('k9');
    expect(activityCardId(entry('column.created', {}, 'column', 'c1'))).toBeUndefined();
  });
});
