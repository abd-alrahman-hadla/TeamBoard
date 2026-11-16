import type { Activity } from '@teamboard/shared';

const FIELD_NAMES: Record<string, string> = {
  title: 'the title',
  description: 'the description',
  labels: 'the labels',
  dueDate: 'the due date',
  assigneeIds: 'the assignees',
};

function listFields(fields: unknown): string {
  const names = (Array.isArray(fields) ? fields : [])
    .map((field) => (typeof field === 'string' ? FIELD_NAMES[field] : undefined))
    .filter((name): name is string => name !== undefined);
  if (names.length === 0) return 'this card';
  if (names.length === 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A sentence for one entry in a card's history, e.g. "Ada moved this card from To do to Doing". */
export function describeActivity(entry: Activity, columnName: (id: string) => string | undefined): string {
  const who = entry.actor?.name ?? 'Someone';
  const column = (key: string) => {
    const id = str(entry.data[key]);
    return (id && columnName(id)) ?? 'a deleted column';
  };
  switch (entry.action) {
    case 'card.created':
      return `${who} created this card in ${column('columnId')}`;
    case 'card.updated':
      return `${who} updated ${listFields(entry.data['fields'])}`;
    case 'card.moved':
      return entry.data['fromColumnId'] === entry.data['toColumnId']
        ? `${who} reordered this card in ${column('toColumnId')}`
        : `${who} moved this card from ${column('fromColumnId')} to ${column('toColumnId')}`;
    case 'card.deleted':
      return `${who} deleted this card`;
    case 'comment.created':
      return `${who} commented`;
    case 'comment.updated':
      return `${who} edited a comment`;
    case 'comment.deleted':
      return `${who} deleted a comment`;
    default:
      return `${who}: ${entry.action}`;
  }
}
