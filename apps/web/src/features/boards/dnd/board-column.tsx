'use client';

import type { Card } from '@teamboard/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AddCard } from '../add-card';
import { useBoardContextValue } from '../board-context';
import type { BoardColumn as BoardColumnData } from '../board-cache';
import { ColumnMenu } from '../column-menu';
import { isTempId } from '../use-board-mutations';
import { SortableCard } from './sortable-card';

export const columnBodyId = (columnId: string) => `body:${columnId}`;

interface BoardColumnProps {
  column: BoardColumnData;
  /** Visible cards in display order (filtered, and reflecting an in-progress drag). */
  cards: Card[];
  /** All cards in the column, before filtering. */
  totalCards: number;
  shouldIgnoreClick: () => boolean;
}

export function BoardColumn({ column, cards, totalCards, shouldIgnoreClick }: BoardColumnProps) {
  const { permissions, mutations } = useBoardContextValue();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const manageable = permissions.canManageColumns && !isTempId(column.id);

  const sortable = useSortable({ id: column.id, data: { type: 'column' }, disabled: !manageable });
  const body = useDroppable({
    id: columnBodyId(column.id),
    data: { type: 'column-body', columnId: column.id },
  });

  const submitRename = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== column.name) void mutations.renameColumn(column.id, trimmed);
    setRenaming(false);
  };

  const filtered = cards.length !== totalCards;

  return (
    <section
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      aria-label={column.name}
      data-testid="column"
      data-column-id={column.id}
      className={cn(
        'bg-muted/60 flex max-h-full w-72 shrink-0 flex-col rounded-xl',
        sortable.isDragging && 'opacity-40',
      )}
    >
      <header className="flex items-center gap-1 px-3 pt-3 pb-2">
        {manageable && (
          <button
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            type="button"
            aria-label={`Reorder column ${column.name}`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 cursor-grab rounded p-0.5 outline-none focus-visible:ring-2 active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" aria-hidden />
          </button>
        )}
        {renaming ? (
          <form onSubmit={submitRename} className="flex-1">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => submitRename()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setName(column.name);
                  setRenaming(false);
                }
              }}
              aria-label="Column name"
              className="h-7"
              maxLength={100}
            />
          </form>
        ) : (
          <h2 className="flex-1 truncate text-sm font-semibold">{column.name}</h2>
        )}
        <span className="text-muted-foreground text-xs tabular-nums" aria-label={`${cards.length} cards`}>
          {filtered ? `${cards.length}/${totalCards}` : totalCards}
        </span>
        {manageable && (
          <ColumnMenu
            columnId={column.id}
            name={column.name}
            cardCount={totalCards}
            onRename={() => {
              setName(column.name);
              setRenaming(true);
            }}
          />
        )}
      </header>

      <div
        ref={body.setNodeRef}
        className={cn(
          'flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2',
          body.isOver && 'bg-muted rounded-lg',
        )}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              columnId={column.id}
              shouldIgnoreClick={shouldIgnoreClick}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <p className="text-muted-foreground py-4 text-center text-xs">
            {filtered ? 'No matching cards' : 'No cards yet'}
          </p>
        )}
      </div>

      {permissions.canEditCards && !isTempId(column.id) && (
        <div className="px-2 pb-2">
          <AddCard columnId={column.id} columnName={column.name} />
        </div>
      )}
    </section>
  );
}
