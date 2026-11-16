import { arrayMove } from '@dnd-kit/sortable';

/** Visible card ids per column, in display order. Drives the sortable lists during a drag. */
export type ColumnOrder = Record<string, string[]>;

export interface CardDrop {
  columnId: string;
  afterId: string | null;
}

/** Column containing `id`, where `id` is either a column id or a card id. */
export function findContainer(order: ColumnOrder, id: string): string | undefined {
  if (id in order) return id;
  return Object.keys(order).find((columnId) => order[columnId]?.includes(id));
}

/**
 * During a drag over another column: moves the active card there, at the hovered card's index
 * (or at the end when hovering the column body itself).
 */
export function moveToContainer(order: ColumnOrder, activeId: string, overId: string): ColumnOrder {
  const from = findContainer(order, activeId);
  const to = findContainer(order, overId);
  if (!from || !to || from === to) return order;
  const target = order[to] ?? [];
  const overIndex = target.indexOf(overId);
  const index = overIndex === -1 ? target.length : overIndex;
  return {
    ...order,
    [from]: (order[from] ?? []).filter((id) => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
  };
}

/** On drop within one column: puts the active card at the hovered card's index. */
export function reorderWithin(order: ColumnOrder, activeId: string, overId: string): ColumnOrder {
  const container = findContainer(order, activeId);
  if (!container || container !== findContainer(order, overId)) return order;
  const items = order[container] ?? [];
  const from = items.indexOf(activeId);
  const to = overId === container ? items.length - 1 : items.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return order;
  return { ...order, [container]: arrayMove(items, from, to) };
}

/** Where the card ended up, as the API wants it: target column + the card it now follows. */
export function cardDrop(order: ColumnOrder, cardId: string): CardDrop | null {
  const columnId = findContainer(order, cardId);
  if (!columnId) return null;
  const items = order[columnId] ?? [];
  const index = items.indexOf(cardId);
  return { columnId, afterId: index > 0 ? (items[index - 1] ?? null) : null };
}

export function sameDrop(a: CardDrop | null, b: CardDrop | null): boolean {
  return a?.columnId === b?.columnId && a?.afterId === b?.afterId;
}

/** New column order after dropping `activeId` on `overId`, and the column it now follows. */
export function columnDrop(
  columnIds: string[],
  activeId: string,
  overId: string,
): { afterId: string | null } | null {
  const from = columnIds.indexOf(activeId);
  const to = columnIds.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return null;
  const next = arrayMove(columnIds, from, to);
  const index = next.indexOf(activeId);
  return { afterId: index > 0 ? (next[index - 1] ?? null) : null };
}
