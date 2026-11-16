import { daysUntil, dueStatus, formatDue, fromDueIso, timeAgo, toDueIso } from './due-date';

const now = new Date(2026, 10, 15, 10, 0); // 15 Nov 2026, 10:00 local

describe('due dates', () => {
  it('stores a picked day as the end of that local day and round-trips', () => {
    const iso = toDueIso('2026-12-01');
    const date = new Date(iso);
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual(
      [2026, 11, 1, 23, 59],
    );
    expect(fromDueIso(iso)).toBe('2026-12-01');
  });

  it('rejects malformed days', () => {
    expect(() => toDueIso('soon')).toThrow();
  });

  it('classifies due status', () => {
    expect(dueStatus(toDueIso('2026-11-14'), now)).toBe('overdue');
    expect(dueStatus(toDueIso('2026-11-15'), now)).toBe('today');
    expect(dueStatus(toDueIso('2026-11-17'), now)).toBe('soon');
    expect(dueStatus(toDueIso('2026-11-30'), now)).toBe('later');
  });

  it('becomes overdue only once the day is over', () => {
    expect(dueStatus(toDueIso('2026-11-15'), new Date(2026, 10, 15, 23, 59, 0))).toBe('today');
    expect(dueStatus(toDueIso('2026-11-15'), new Date(2026, 10, 16, 0, 0, 1))).toBe('overdue');
  });

  it('formats relative days', () => {
    expect(daysUntil(toDueIso('2026-11-16'), now)).toBe(1);
    expect(formatDue(toDueIso('2026-11-15'), now)).toBe('Today');
    expect(formatDue(toDueIso('2026-11-16'), now)).toBe('Tomorrow');
    expect(formatDue(toDueIso('2026-11-14'), now)).toBe('Yesterday');
  });
});

describe('timeAgo', () => {
  const at = new Date(2026, 10, 16, 12, 0, 0);
  const iso = (deltaSeconds: number) => new Date(at.getTime() + deltaSeconds * 1000).toISOString();

  it('says "just now" for fresh and slightly-future timestamps', () => {
    expect(timeAgo(iso(-10), at)).toBe('just now');
    expect(timeAgo(iso(30), at)).toBe('just now');
  });

  it('counts minutes and hours in the past', () => {
    expect(timeAgo(iso(-5 * 60), at)).toMatch(/5 minutes ago/);
    expect(timeAgo(iso(-3 * 3600), at)).toMatch(/3 hours ago/);
  });
});
