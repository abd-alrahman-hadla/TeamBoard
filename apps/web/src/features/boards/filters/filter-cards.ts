import type { Card } from '@teamboard/shared';
import { daysUntil } from '../due-date';

export const DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

/** Pseudo assignee id meaning "cards with nobody assigned". */
export const UNASSIGNED = 'none';

export interface CardFilters {
  query: string;
  assignees: string[];
  labels: string[];
  due: DueFilter | null;
}

export const EMPTY_FILTERS: CardFilters = { query: '', assignees: [], labels: [], due: null };

export function isFiltering(filters: CardFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.assignees.length > 0 ||
    filters.labels.length > 0 ||
    filters.due !== null
  );
}

function matchesQuery(card: Card, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [card.title, card.description ?? '', ...card.labels].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

function matchesAssignees(card: Card, assignees: string[]): boolean {
  if (assignees.length === 0) return true;
  if (card.assigneeIds.length === 0) return assignees.includes(UNASSIGNED);
  return card.assigneeIds.some((id) => assignees.includes(id));
}

function matchesLabels(card: Card, labels: string[]): boolean {
  return labels.length === 0 || card.labels.some((label) => labels.includes(label));
}

function matchesDue(card: Card, due: DueFilter | null, now: Date): boolean {
  if (due === null) return true;
  if (due === 'none') return card.dueDate === null;
  if (card.dueDate === null) return false;
  const overdue = new Date(card.dueDate).getTime() < now.getTime();
  if (due === 'overdue') return overdue;
  const days = daysUntil(card.dueDate, now);
  if (due === 'today') return !overdue && days === 0;
  return !overdue && days >= 0 && days <= 6; // 'week': today plus the next six days
}

/** Every criterion must match (AND); values within one criterion are alternatives (OR). */
export function matchesFilters(card: Card, filters: CardFilters, now: Date): boolean {
  return (
    matchesQuery(card, filters.query) &&
    matchesAssignees(card, filters.assignees) &&
    matchesLabels(card, filters.labels) &&
    matchesDue(card, filters.due, now)
  );
}

export function filterCards(cards: readonly Card[], filters: CardFilters, now: Date): Card[] {
  return isFiltering(filters) ? cards.filter((card) => matchesFilters(card, filters, now)) : [...cards];
}

/** URL search params ⇄ filters (shareable, survives reload). */
export function filtersFromParams(params: URLSearchParams): CardFilters {
  const due = params.get('due');
  return {
    query: params.get('q') ?? '',
    assignees: params.getAll('assignee'),
    labels: params.getAll('label'),
    due: DUE_FILTERS.includes(due as DueFilter) ? (due as DueFilter) : null,
  };
}

export function applyFiltersToParams(params: URLSearchParams, filters: CardFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['q', 'assignee', 'label', 'due']) next.delete(key);
  if (filters.query.trim()) next.set('q', filters.query.trim());
  for (const id of filters.assignees) next.append('assignee', id);
  for (const label of filters.labels) next.append('label', label);
  if (filters.due) next.set('due', filters.due);
  return next;
}
