import type { Activity } from './schemas/board';

/** Board feed ("Sara moved 'Login page' from To do to In progress") or one card's history ("…moved this card…"). */
export type ActivityScope = 'board' | 'card';

/** Current names, used when an older activity row has no snapshot of them. */
export interface ActivityLookup {
  columnName: (columnId: string) => string | undefined;
  cardTitle: (cardId: string) => string | undefined;
}

const FIELD_NAMES: Record<string, string> = {
  title: 'the title',
  description: 'the description',
  labels: 'the labels',
  dueDate: 'the due date',
  assigneeIds: 'the assignees',
};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

function listFields(fields: unknown): string | undefined {
  const names = (Array.isArray(fields) ? fields : [])
    .map((field) => (typeof field === 'string' ? FIELD_NAMES[field] : undefined))
    .filter((name): name is string => name !== undefined);
  if (names.length === 0) return undefined;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** The card an entry is about (card events: the entity; comment events: data.cardId). */
export function activityCardId(entry: Activity): string | undefined {
  if (entry.entityType === 'card') return entry.entityId;
  return str(entry.data['cardId']);
}

/** One readable sentence per activity entry. Snapshots win over current names, so history survives renames and deletes. */
export function describeActivity(entry: Activity, scope: ActivityScope, lookup: ActivityLookup): string {
  const who = entry.actor?.name ?? 'Someone';
  const d = entry.data;
  const cardId = activityCardId(entry);
  const title =
    str(d['cardTitle']) ?? str(d['title']) ?? (cardId ? lookup.cardTitle(cardId) : undefined) ?? 'a card';
  const quoted = `'${title}'`;
  const column = (nameKey: string, idKey: string) =>
    str(d[nameKey]) ?? lookup.columnName(str(d[idKey]) ?? '') ?? 'a deleted column';
  const onBoard = scope === 'board';

  switch (entry.action) {
    case 'card.created':
      return onBoard
        ? `${who} added ${quoted} to ${column('columnName', 'columnId')}`
        : `${who} created this card in ${column('columnName', 'columnId')}`;
    case 'card.updated': {
      const previous = str(d['previousTitle']);
      if (previous) {
        return onBoard
          ? `${who} renamed '${previous}' to ${quoted}`
          : `${who} renamed this card from '${previous}' to ${quoted}`;
      }
      const fields = listFields(d['fields']) ?? 'the details';
      return onBoard ? `${who} updated ${fields} of ${quoted}` : `${who} updated ${fields}`;
    }
    case 'card.moved': {
      const to = column('toColumnName', 'toColumnId');
      if (d['fromColumnId'] === d['toColumnId']) {
        return onBoard ? `${who} reordered ${quoted} in ${to}` : `${who} reordered this card in ${to}`;
      }
      const from = column('fromColumnName', 'fromColumnId');
      return onBoard
        ? `${who} moved ${quoted} from ${from} to ${to}`
        : `${who} moved this card from ${from} to ${to}`;
    }
    case 'card.deleted':
      return onBoard ? `${who} deleted ${quoted}` : `${who} deleted this card`;
    case 'comment.created':
      return onBoard ? `${who} commented on ${quoted}` : `${who} commented`;
    case 'comment.updated':
      return onBoard ? `${who} edited a comment on ${quoted}` : `${who} edited a comment`;
    case 'comment.deleted':
      return onBoard ? `${who} deleted a comment on ${quoted}` : `${who} deleted a comment`;
    case 'column.created':
      return `${who} added the column ${str(d['name']) ?? ''}`.trimEnd();
    case 'column.updated': {
      const previous = str(d['previousName']);
      const name = str(d['name']) ?? 'a column';
      return previous
        ? `${who} renamed the column ${previous} to ${name}`
        : `${who} updated the column ${name}`;
    }
    case 'column.moved':
      return `${who} moved the column ${str(d['name']) ?? lookup.columnName(entry.entityId) ?? ''}`.trimEnd();
    case 'column.deleted':
      return `${who} deleted the column ${str(d['name']) ?? ''}`.trimEnd();
    case 'board.created':
      return `${who} created the board`;
    case 'board.updated':
      return `${who} updated the board`;
    case 'board.deleted':
      return `${who} deleted the board ${str(d['name']) ?? ''}`.trimEnd();
    default:
      return `${who}: ${entry.action}`;
  }
}
