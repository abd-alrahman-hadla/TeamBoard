'use client';

import type { Card } from '@teamboard/shared';
import { PlusIcon } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBoardContextValue } from './board-context';
import { positionAfter } from './board-cache';
import { TEMP_PREFIX } from './use-board-mutations';

/** "Add a card" composer at the bottom of a column. Keeps focus for quick multiple adds. */
export function AddCard({ columnId, columnName }: { columnId: string; columnName: string }) {
  const { board, mutations } = useBoardContextValue();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const column = board.columns.find((c) => c.id === columnId);
    const now = new Date().toISOString();
    const placeholder: Card = {
      id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
      boardId: board.id,
      columnId,
      title: trimmed.slice(0, 200),
      description: null,
      labels: [],
      dueDate: null,
      assigneeIds: [],
      position: positionAfter(column?.cards ?? [], column?.cards.at(-1)?.id ?? null),
      version: 0,
      createdById: null,
      createdAt: now,
      updatedAt: now,
    };
    void mutations.createCard(columnId, { title: placeholder.title }, placeholder);
    setTitle('');
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground w-full justify-start"
        onClick={() => setOpen(true)}
        aria-label={`Add a card to ${columnName}`}
      >
        <PlusIcon aria-hidden />
        Add a card
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        ref={inputRef}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) submit(event);
          if (event.key === 'Escape') setOpen(false);
        }}
        placeholder="Card title"
        aria-label={`New card title in ${columnName}`}
        className="min-h-16 resize-none text-sm"
        maxLength={200}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim()}>
          Add card
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
