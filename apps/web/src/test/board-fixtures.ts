import { type BoardDetail, type Card, positionBetween } from '@teamboard/shared';

let counter = 0;
const uuid = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

const NOW = '2026-11-15T10:00:00.000Z';

export function makeCard(overrides: Partial<Card> & Pick<Card, 'columnId' | 'position'>): Card {
  return {
    id: uuid(),
    boardId: 'b0000000-0000-4000-8000-000000000001',
    title: 'Card',
    description: null,
    labels: [],
    dueDate: null,
    assigneeIds: [],
    version: 1,
    createdById: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A board with columns of the given titles; each column's cards get increasing positions. */
export function makeBoard(spec: Record<string, string[]>): BoardDetail {
  let columnKey: string | null = null;
  const columns = Object.entries(spec).map(([name, titles]) => {
    columnKey = positionBetween(columnKey, null);
    const columnId = uuid();
    let cardKey: string | null = null;
    const cards = titles.map((title) => {
      cardKey = positionBetween(cardKey, null);
      return makeCard({ columnId, position: cardKey, title });
    });
    return {
      id: columnId,
      boardId: 'b0000000-0000-4000-8000-000000000001',
      name,
      position: columnKey,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      cards,
    };
  });
  return {
    id: 'b0000000-0000-4000-8000-000000000001',
    workspaceId: 'w0000000-0000-4000-8000-000000000001',
    name: 'Board',
    description: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    columns,
  };
}

export function titles(board: BoardDetail): Record<string, string[]> {
  return Object.fromEntries(board.columns.map((c) => [c.name, c.cards.map((card) => card.title)]));
}

export function cardByTitle(board: BoardDetail, title: string): Card {
  const card = board.columns.flatMap((c) => c.cards).find((c) => c.title === title);
  if (!card) throw new Error(`no card "${title}"`);
  return card;
}

export function columnByName(board: BoardDetail, name: string) {
  const column = board.columns.find((c) => c.name === name);
  if (!column) throw new Error(`no column "${name}"`);
  return column;
}
