'use client';

import type { Card } from '@teamboard/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useBoardContextValue } from '../board-context';
import { CardTile } from '../card-tile';
import { isTempId } from '../use-board-mutations';

interface SortableCardProps {
  card: Card;
  columnId: string;
  /** True right after a drag, so the pointer-up doesn't also open the card. */
  shouldIgnoreClick: () => boolean;
}

export function SortableCard({ card, columnId, shouldIgnoreClick }: SortableCardProps) {
  const { permissions, memberById, now, openCard, editorsOf } = useBoardContextValue();
  const pending = isTempId(card.id);
  const draggable = permissions.canEditCards && !pending;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId },
    disabled: !draggable,
  });

  const open = () => {
    if (!pending && !shouldIgnoreClick()) openCard(card.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !isDragging) {
      event.preventDefault();
      open();
      return;
    }
    listeners?.['onKeyDown']?.(event);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      role="button"
      tabIndex={0}
      aria-label={card.title}
      aria-busy={pending || undefined}
      data-testid="card"
      data-card-id={card.id}
      onClick={open}
      onKeyDown={onKeyDown}
      className={cn(
        'focus-visible:ring-ring rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging && 'opacity-40',
        pending && 'opacity-60',
      )}
    >
      <CardTile
        card={card}
        memberById={memberById}
        now={now}
        editors={editorsOf(card.id)}
        className="hover:border-foreground/20 transition-colors"
      />
    </div>
  );
}
