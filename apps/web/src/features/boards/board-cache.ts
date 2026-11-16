import {
  type BoardDetail,
  type Card,
  type Column,
  comparePositions,
  positionBetween,
} from '@teamboard/shared';

/**
 * Pure reducers over the cached board. Optimistic updates, rollbacks and (in Phase 7) socket
 * events all go through these, so the cache always stays sorted by fractional position.
 */

export type BoardColumn = BoardDetail['columns'][number];

const byPosition = (a: { position: string }, b: { position: string }) =>
  comparePositions(a.position, b.position);

export function findCard(board: BoardDetail | undefined, cardId: string): Card | undefined {
  for (const column of board?.columns ?? []) {
    const card = column.cards.find((c) => c.id === cardId);
    if (card) return card;
  }
  return undefined;
}

export function findColumn(board: BoardDetail | undefined, columnId: string): BoardColumn | undefined {
  return board?.columns.find((c) => c.id === columnId);
}

export function allCards(board: BoardDetail): Card[] {
  return board.columns.flatMap((c) => c.cards);
}

/** The key for "after `afterId`" among `siblings` (sorted, excluding the item being placed). */
export function positionAfter(
  siblings: readonly { id: string; position: string }[],
  afterId: string | null,
): string {
  if (afterId === null) return positionBetween(null, siblings[0]?.position ?? null);
  const index = siblings.findIndex((s) => s.id === afterId);
  if (index === -1) return positionBetween(siblings.at(-1)?.position ?? null, null);
  return positionBetween(siblings[index]?.position ?? null, siblings[index + 1]?.position ?? null);
}

/** Puts `card` (server truth or a restored snapshot) where its columnId/position say. */
export function replaceCard(board: BoardDetail, card: Card): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((column) => {
      const others = column.cards.filter((c) => c.id !== card.id);
      if (column.id !== card.columnId) {
        return others.length === column.cards.length ? column : { ...column, cards: others };
      }
      return { ...column, cards: [...others, card].sort(byPosition) };
    }),
  };
}

export function insertCard(board: BoardDetail, card: Card): BoardDetail {
  return replaceCard(board, card);
}

export function removeCard(board: BoardDetail, cardId: string): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.cards.some((c) => c.id === cardId)
        ? { ...column, cards: column.cards.filter((c) => c.id !== cardId) }
        : column,
    ),
  };
}

/** A patch where `undefined` means "unchanged" (as in a PATCH body). */
export type CardPatch = { [K in keyof Card]?: Card[K] | undefined };

export function patchCard(board: BoardDetail, cardId: string, patch: CardPatch): BoardDetail {
  const card = findCard(board, cardId);
  if (!card) return board;
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  return replaceCard(board, { ...card, ...defined });
}

/** Optimistic move: computes the same fractional key the server will. */
export function moveCardTo(
  board: BoardDetail,
  cardId: string,
  columnId: string,
  afterId: string | null,
): BoardDetail {
  const card = findCard(board, cardId);
  const target = findColumn(board, columnId);
  if (!card || !target) return board;
  const siblings = target.cards.filter((c) => c.id !== cardId);
  return replaceCard(board, { ...card, columnId, position: positionAfter(siblings, afterId) });
}

/** Restores or applies a column's own fields, keeping its cards. */
export function replaceColumn(board: BoardDetail, column: Column): BoardDetail {
  const existing = findColumn(board, column.id);
  const next: BoardColumn = { ...column, cards: existing?.cards ?? [] };
  return {
    ...board,
    columns: [...board.columns.filter((c) => c.id !== column.id), next].sort(byPosition),
  };
}

export function insertColumn(board: BoardDetail, column: BoardColumn): BoardDetail {
  return { ...board, columns: [...board.columns.filter((c) => c.id !== column.id), column].sort(byPosition) };
}

export function removeColumn(board: BoardDetail, columnId: string): BoardDetail {
  return { ...board, columns: board.columns.filter((c) => c.id !== columnId) };
}

export function patchColumn(board: BoardDetail, columnId: string, patch: Partial<Column>): BoardDetail {
  const column = findColumn(board, columnId);
  return column ? replaceColumn(board, { ...column, ...patch }) : board;
}

export function moveColumnTo(board: BoardDetail, columnId: string, afterId: string | null): BoardDetail {
  const column = findColumn(board, columnId);
  if (!column) return board;
  const siblings = board.columns.filter((c) => c.id !== columnId);
  return replaceColumn(board, { ...column, position: positionAfter(siblings, afterId) });
}

/** Labels used anywhere on the board, for suggestions and filters. */
export function boardLabels(board: BoardDetail): string[] {
  return [...new Set(allCards(board).flatMap((c) => c.labels))].sort((a, b) => a.localeCompare(b));
}
