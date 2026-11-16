'use client';

import type { Card, Member } from '@teamboard/shared';
import { AlignLeftIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DueBadge, LabelChip, MemberAvatar } from './card-parts';

interface CardTileProps {
  card: Card;
  memberById: ReadonlyMap<string, Member>;
  now: Date;
  className?: string;
}

/** The card face shown on the board (also used as the drag preview). */
export function CardTile({ card, memberById, now, className }: CardTileProps) {
  const assignees = card.assigneeIds
    .map((id) => memberById.get(id))
    .filter((m): m is Member => m !== undefined);
  const hasMeta = card.dueDate !== null || card.description || assignees.length > 0;
  return (
    <div className={cn('bg-card space-y-2 rounded-lg border p-3 text-left shadow-xs', className)}>
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <LabelChip key={label} label={label} />
          ))}
        </div>
      )}
      <p className="text-sm leading-snug font-medium break-words">{card.title}</p>
      {hasMeta && (
        <div className="flex items-center gap-2">
          {card.dueDate && <DueBadge iso={card.dueDate} now={now} />}
          {card.description && (
            <AlignLeftIcon className="text-muted-foreground size-3.5" aria-label="Has a description" />
          )}
          {assignees.length > 0 && (
            <div className="ml-auto flex -space-x-1.5">
              {assignees.slice(0, 3).map((member) => (
                <MemberAvatar key={member.userId} member={member} />
              ))}
              {assignees.length > 3 && (
                <span className="bg-muted ring-background flex size-6 items-center justify-center rounded-full text-[10px] ring-2">
                  +{assignees.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
