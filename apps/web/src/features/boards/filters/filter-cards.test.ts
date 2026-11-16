import type { Card } from '@teamboard/shared';
import { makeCard } from '@/test/board-fixtures';
import { toDueIso } from '../due-date';
import {
  applyFiltersToParams,
  type CardFilters,
  EMPTY_FILTERS,
  filterCards,
  filtersFromParams,
  isFiltering,
  UNASSIGNED,
} from './filter-cards';

const now = new Date(2026, 10, 15, 10, 0);
const ADA = 'a0000000-0000-4000-8000-000000000001';
const BOB = 'a0000000-0000-4000-8000-000000000002';

const card = (title: string, extra: Partial<Card> = {}) =>
  makeCard({ columnId: 'c', position: 'a0', title, ...extra });

const cards = [
  card('Fix login bug', { labels: ['bug'], assigneeIds: [ADA], dueDate: toDueIso('2026-11-14') }),
  card('Write docs', {
    description: 'Explain the **API**',
    labels: ['docs'],
    dueDate: toDueIso('2026-11-15'),
  }),
  card('Design review', { assigneeIds: [BOB], dueDate: toDueIso('2026-11-19') }),
  card('Refactor', { labels: ['bug', 'tech-debt'], assigneeIds: [ADA, BOB] }),
];

const run = (filters: Partial<CardFilters>) =>
  filterCards(cards, { ...EMPTY_FILTERS, ...filters }, now).map((c) => c.title);

describe('filterCards', () => {
  it('returns everything without filters', () => {
    expect(run({})).toHaveLength(4);
    expect(isFiltering(EMPTY_FILTERS)).toBe(false);
  });

  it('searches title, description and labels, case-insensitively', () => {
    expect(run({ query: 'BUG' })).toEqual(['Fix login bug', 'Refactor']);
    expect(run({ query: 'api' })).toEqual(['Write docs']);
    expect(run({ query: '  review ' })).toEqual(['Design review']);
  });

  it('filters by assignee, including unassigned', () => {
    expect(run({ assignees: [BOB] })).toEqual(['Design review', 'Refactor']);
    expect(run({ assignees: [UNASSIGNED] })).toEqual(['Write docs']);
    expect(run({ assignees: [UNASSIGNED, ADA] })).toEqual(['Fix login bug', 'Write docs', 'Refactor']);
  });

  it('filters by label (any of)', () => {
    expect(run({ labels: ['docs', 'tech-debt'] })).toEqual(['Write docs', 'Refactor']);
  });

  it('filters by due date', () => {
    expect(run({ due: 'overdue' })).toEqual(['Fix login bug']);
    expect(run({ due: 'today' })).toEqual(['Write docs']);
    expect(run({ due: 'week' })).toEqual(['Write docs', 'Design review']);
    expect(run({ due: 'none' })).toEqual(['Refactor']);
  });

  it('combines criteria with AND', () => {
    expect(run({ labels: ['bug'], assignees: [BOB] })).toEqual(['Refactor']);
    expect(run({ labels: ['bug'], due: 'overdue', query: 'login' })).toEqual(['Fix login bug']);
  });
});

describe('URL params', () => {
  it('round-trips filters and keeps unrelated params', () => {
    const filters: CardFilters = {
      query: 'docs',
      assignees: [ADA, UNASSIGNED],
      labels: ['bug'],
      due: 'week',
    };
    const params = applyFiltersToParams(new URLSearchParams('card=123'), filters);
    expect(params.get('card')).toBe('123');
    expect(filtersFromParams(params)).toEqual(filters);
  });

  it('ignores unknown due values and clears empty filters', () => {
    expect(filtersFromParams(new URLSearchParams('due=someday')).due).toBeNull();
    expect(applyFiltersToParams(new URLSearchParams('q=x&label=a'), EMPTY_FILTERS).toString()).toBe('');
  });
});
