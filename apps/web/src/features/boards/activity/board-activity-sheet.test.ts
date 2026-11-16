import type { Activity } from '@teamboard/shared';
import { dayLabel, groupByDay } from './board-activity-sheet';

const now = new Date(2026, 10, 16, 15, 0);
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const entry = (createdAt: string, id: string): Activity => ({
  id,
  workspaceId: 'w',
  boardId: 'b',
  actor: null,
  entityType: 'card',
  entityId: 'k',
  action: 'card.updated',
  data: {},
  createdAt,
});

describe('activity grouping', () => {
  it('labels today and yesterday', () => {
    expect(dayLabel(at(16), now)).toBe('Today');
    expect(dayLabel(at(15, 23), now)).toBe('Yesterday');
    expect(dayLabel(at(10), now)).not.toMatch(/Today|Yesterday/);
  });

  it('groups consecutive entries by day, keeping order', () => {
    const groups = groupByDay(
      [entry(at(16, 14), 'a'), entry(at(16, 9), 'b'), entry(at(15), 'c'), entry(at(12), 'd')],
      now,
    );
    expect(groups.map((g) => [g.day.length > 0, g.entries.map((e) => e.id)])).toEqual([
      [true, ['a', 'b']],
      [true, ['c']],
      [true, ['d']],
    ]);
    expect(groups.slice(0, 2).map((g) => g.day)).toEqual(['Today', 'Yesterday']);
  });
});
