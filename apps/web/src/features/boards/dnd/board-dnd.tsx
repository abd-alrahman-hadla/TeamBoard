'use client';

import type { Card } from '@teamboard/shared';
import {
  type Active,
  type Announcements,
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  getFirstCollision,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  type Over,
  PointerSensor,
  pointerWithin,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AddColumn } from '../add-column';
import { useBoardContextValue } from '../board-context';
import { CardTile } from '../card-tile';
import { BoardColumn } from './board-column';
import {
  cardDrop,
  columnDrop,
  type ColumnOrder,
  moveToContainer,
  reorderWithin,
  sameDrop,
} from './dnd-logic';

interface BoardDndProps {
  /** Visible (filtered) card ids per column. */
  visibleOrder: ColumnOrder;
  cardsById: ReadonlyMap<string, Card>;
}

const CLICK_SUPPRESS_MS = 250;

/** Maps a hovered droppable to the id our order logic understands (a column body → its column id). */
function overKey(over: Over | null): string | null {
  if (!over) return null;
  const data = over.data.current as { type?: string; columnId?: string } | undefined;
  return data?.type === 'column-body' && data.columnId ? data.columnId : String(over.id);
}

function activeType(active: Active | null): 'card' | 'column' | null {
  const type = (active?.data.current as { type?: string } | undefined)?.type;
  return type === 'card' || type === 'column' ? type : null;
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Nearest slot strictly before/after `from` along one axis. */
function nearest<T extends { center: number }>(slots: T[], from: number, forward: boolean): T | undefined {
  return forward
    ? slots.filter((s) => s.center > from + 1).sort((a, b) => a.center - b.center)[0]
    : slots.filter((s) => s.center < from - 1).sort((a, b) => b.center - a.center)[0];
}

/**
 * Keyboard moves with plain geometry, so they're predictable:
 * - card ←/→: to the top of the neighbouring column's list; ↑/↓: past the neighbouring card in its column;
 * - column ←/→: to the neighbouring column's slot.
 * dnd-kit's default sortable getter searches every droppable type at once (cards, column bodies,
 * columns) and on this board it can stall on a shifted column or skip an empty one.
 * Returned coordinates are the new top-left of the dragged item.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!ARROWS.has(event.code)) return undefined;
  event.preventDefault();
  const { active, collisionRect, droppableRects, droppableContainers } = context;
  if (!active || !collisionRect) return undefined;

  const slotsOf = (type: string) =>
    droppableContainers
      .getEnabled()
      .filter((c) => (c.data.current as { type?: string } | undefined)?.type === type && c.id !== active.id)
      .map((c) => droppableRects.get(c.id))
      .filter((rect): rect is NonNullable<typeof rect> => rect !== undefined);
  const centerX = collisionRect.left + collisionRect.width / 2;
  const centerY = collisionRect.top + collisionRect.height / 2;
  const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
  const forward = event.code === 'ArrowRight' || event.code === 'ArrowDown';

  if (activeType(active) === 'column') {
    if (!horizontal) return undefined;
    const target = nearest(
      slotsOf('column').map((rect) => ({ rect, center: rect.left + rect.width / 2 })),
      centerX,
      forward,
    );
    return target ? { x: target.rect.left, y: target.rect.top } : undefined;
  }

  if (horizontal) {
    const target = nearest(
      slotsOf('column-body').map((rect) => ({ rect, center: rect.left + rect.width / 2 })),
      centerX,
      forward,
    );
    return target
      ? { x: target.rect.left + (target.rect.width - collisionRect.width) / 2, y: target.rect.top }
      : undefined;
  }

  const sameColumn = slotsOf('card')
    .filter((rect) => rect.left <= centerX && centerX <= rect.left + rect.width)
    .map((rect) => ({ rect, center: rect.top + rect.height / 2 }));
  const target = nearest(sameColumn, centerY, forward);
  if (!target) return undefined;
  // Centre on the neighbour, so it (not the card's own old slot) is the biggest overlap.
  return { x: collisionRect.left, y: target.center - collisionRect.height / 2 };
};

export function BoardDnd({ visibleOrder, cardsById }: BoardDndProps) {
  const { board, permissions, mutations, memberById, now } = useBoardContextValue();

  // Local overrides while a drag (and its optimistic write) is in progress; null = derive from the cache.
  const [dragOrder, setDragOrder] = useState<ColumnOrder | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[] | null>(null);
  const [active, setActive] = useState<{ type: 'card' | 'column'; id: string } | null>(null);
  const startDrop = useRef<ReturnType<typeof cardDrop>>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const suppressClickUntil = useRef(0);

  const order = dragOrder ?? visibleOrder;
  const orderRef = useRef(order);
  orderRef.current = order;

  const columnIds = columnOrder ?? board.columns.map((c) => c.id);
  const columnsById = useMemo(() => new Map(board.columns.map((c) => [c.id, c])), [board.columns]);

  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const keyboard = useSensor(KeyboardSensor, {
    coordinateGetter: keyboardCoordinates,
    // Enter opens a card, so only Space picks up.
    keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
  });
  const sensors = useSensors(pointer, keyboard);
  const noSensors = useSensors();

  const shouldIgnoreClick = useCallback(() => Date.now() < suppressClickUntil.current, []);

  /**
   * Columns only collide with columns. Cards prefer the card under the pointer; over a column's
   * empty area they snap to that column's closest card (or the column itself when it's empty).
   */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (activeType(args.active) === 'column') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => (c.data.current as { type?: string } | undefined)?.type === 'column',
        ),
      });
    }
    const containers = args.droppableContainers.filter(
      (c) => (c.data.current as { type?: string } | undefined)?.type !== 'column',
    );
    const scoped = { ...args, droppableContainers: containers };
    const pointerHits = pointerWithin(scoped);

    if (pointerHits.length === 0) {
      // Keyboard (or pointer between columns): nearest centre wins among cards, the card's own slot
      // included (so picking up doesn't move it), plus the bodies of columns with no other cards.
      const candidates = containers.filter((c) => {
        const data = c.data.current as { type?: string; columnId?: string } | undefined;
        if (data?.type === 'card') return true;
        const others = (orderRef.current[data?.columnId ?? ''] ?? []).filter((id) => id !== args.active.id);
        return data?.type === 'column-body' && others.length === 0;
      });
      const overId =
        closestCenter({ ...scoped, droppableContainers: candidates })[0]?.id ?? lastOverId.current;
      lastOverId.current = overId;
      return overId == null ? [] : [{ id: overId }];
    }

    let overId = getFirstCollision(pointerHits, 'id');
    if (overId == null) return lastOverId.current ? [{ id: lastOverId.current }] : [];

    const over = containers.find((c) => c.id === overId);
    const data = over?.data.current as { type?: string; columnId?: string } | undefined;
    if (data?.type === 'column-body' && data.columnId) {
      const items = orderRef.current[data.columnId] ?? [];
      if (items.length > 0) {
        const inner = closestCenter({
          ...scoped,
          droppableContainers: containers.filter((c) => items.includes(String(c.id))),
        });
        overId = inner[0]?.id ?? overId;
      }
    }
    lastOverId.current = overId;
    return [{ id: overId }];
  }, []);

  const onDragStart = ({ active: started }: DragStartEvent) => {
    const type = activeType(started);
    if (!type) return;
    setActive({ type, id: String(started.id) });
    if (type === 'card') {
      setDragOrder(visibleOrder);
      startDrop.current = cardDrop(visibleOrder, String(started.id));
    }
  };

  const onDragOver = ({ active: dragged, over }: DragOverEvent) => {
    const key = overKey(over);
    if (activeType(dragged) !== 'card' || !key) return;
    setDragOrder((current) => moveToContainer(current ?? visibleOrder, String(dragged.id), key));
  };

  const finish = () => {
    setActive(null);
    lastOverId.current = null;
    suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
  };

  const onDragEnd = ({ active: dropped, over }: DragEndEvent) => {
    const id = String(dropped.id);
    const key = overKey(over);
    finish();

    if (activeType(dropped) === 'column') {
      const target = key ? columnDrop(columnIds, id, key) : null;
      if (!target || !key) return;
      setColumnOrder(arrayMove(columnIds, columnIds.indexOf(id), columnIds.indexOf(key)));
      void mutations.moveColumn(id, target.afterId).finally(() => setColumnOrder(null));
      return;
    }

    const finalOrder = key ? reorderWithin(dragOrder ?? visibleOrder, id, key) : (dragOrder ?? visibleOrder);
    const drop = cardDrop(finalOrder, id);
    if (!drop || sameDrop(drop, startDrop.current)) {
      setDragOrder(null);
      return;
    }
    // Keep showing the dropped order until the optimistic cache update has landed (no flicker).
    setDragOrder(finalOrder);
    void mutations.moveCard(id, drop.columnId, drop.afterId).finally(() => setDragOrder(null));
  };

  const onDragCancel = () => {
    finish();
    setDragOrder(null);
  };

  const describe = useCallback(
    (id: UniqueIdentifier): string => {
      const card = cardsById.get(String(id));
      if (card) return `card “${card.title}”`;
      const column = columnsById.get(String(id));
      return column ? `column “${column.name}”` : 'item';
    },
    [cardsById, columnsById],
  );

  /**
   * Where the card would land if dropped over `over` right now. Moves within a column are only
   * shown by transforms until the drop, so project them here rather than reading the order.
   */
  const position = useCallback(
    (cardId: string, over: Over | null): string => {
      const key = overKey(over);
      // Announcements run before this drag-over's state update renders, so apply both steps here.
      const projected = key
        ? reorderWithin(moveToContainer(orderRef.current, cardId, key), cardId, key)
        : orderRef.current;
      const columnId = Object.keys(projected).find((c) => projected[c]?.includes(cardId));
      if (!columnId) return '';
      const items = projected[columnId] ?? [];
      return `position ${items.indexOf(cardId) + 1} of ${items.length} in column “${columnsById.get(columnId)?.name ?? ''}”`;
    },
    [columnsById],
  );

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${describe(a.id)}.`,
    onDragOver: ({ active: a, over }) =>
      over
        ? `${describe(a.id)} is now at ${activeType(a) === 'card' ? position(String(a.id), over) : `the place of ${describe(over.id)}`}.`
        : `${describe(a.id)} is no longer over a list.`,
    onDragEnd: ({ active: a, over }) =>
      over
        ? `Dropped ${describe(a.id)}${activeType(a) === 'card' ? ` at ${position(String(a.id), over)}` : ''}.`
        : `Dropped ${describe(a.id)}.`,
    onDragCancel: ({ active: a }) => `Cancelled. ${describe(a.id)} returned to where it was.`,
  };

  const activeCard = active?.type === 'card' ? cardsById.get(active.id) : undefined;
  const activeColumn = active?.type === 'column' ? columnsById.get(active.id) : undefined;

  return (
    <DndContext
      sensors={permissions.canEditCards ? sensors : noSensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move a card or column, press Space to pick it up, use the arrow keys to move it, then Space to drop it or Escape to cancel. Press Enter to open a card.',
        },
      }}
    >
      <div className="flex h-full items-start gap-3 overflow-x-auto p-4 pt-2" data-testid="board-columns">
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          {columnIds.map((columnId) => {
            const column = columnsById.get(columnId);
            if (!column) return null;
            const cards = (order[columnId] ?? [])
              .map((id) => cardsById.get(id))
              .filter((card): card is Card => card !== undefined);
            return (
              <BoardColumn
                key={columnId}
                column={column}
                cards={cards}
                totalCards={column.cards.length}
                shouldIgnoreClick={shouldIgnoreClick}
              />
            );
          })}
        </SortableContext>
        {permissions.canManageColumns && <AddColumn />}
      </div>

      <DragOverlay>
        {activeCard && (
          <CardTile
            card={activeCard}
            memberById={memberById}
            now={now}
            className="w-68 rotate-2 cursor-grabbing shadow-lg"
          />
        )}
        {activeColumn && (
          <div className="bg-muted w-72 rounded-xl p-3 shadow-lg">
            <p className="text-sm font-semibold">{activeColumn.name}</p>
            <p className="text-muted-foreground text-xs">{activeColumn.cards.length} cards</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
