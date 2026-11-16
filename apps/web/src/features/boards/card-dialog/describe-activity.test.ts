import type { Activity } from '@teamboard/shared';
import { describeActivity } from './describe-activity';

const columns: Record<string, string> = { c1: 'To do', c2: 'Doing' };
const name = (id: string) => columns[id];

const entry = (
  action: string,
  data: Record<string, unknown> = {},
  actor: Activity['actor'] = { id: 'u', name: 'Ada' },
): Activity => ({
  id: '0195a000-0000-7000-8000-000000000001',
  workspaceId: '0195a000-0000-7000-8000-000000000002',
  boardId: null,
  actor,
  entityType: 'card',
  entityId: '0195a000-0000-7000-8000-000000000003',
  action,
  data,
  createdAt: '2026-11-15T10:00:00.000Z',
});

describe('describeActivity', () => {
  it.each([
    [entry('card.created', { columnId: 'c1' }), 'Ada created this card in To do'],
    [entry('card.updated', { fields: ['title'] }), 'Ada updated the title'],
    [
      entry('card.updated', { fields: ['labels', 'dueDate', 'assigneeIds'] }),
      'Ada updated the labels, the due date and the assignees',
    ],
    [
      entry('card.moved', { fromColumnId: 'c1', toColumnId: 'c2' }),
      'Ada moved this card from To do to Doing',
    ],
    [entry('card.moved', { fromColumnId: 'c2', toColumnId: 'c2' }), 'Ada reordered this card in Doing'],
    [
      entry('card.moved', { fromColumnId: 'gone', toColumnId: 'c2' }),
      'Ada moved this card from a deleted column to Doing',
    ],
    [entry('comment.created'), 'Ada commented'],
    [entry('comment.deleted', {}, null), 'Someone deleted a comment'],
  ])('%#: %s', (activity, sentence) => {
    expect(describeActivity(activity, name)).toBe(sentence);
  });
});
