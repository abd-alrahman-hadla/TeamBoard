'use client';

import { PlusIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBoardContextValue } from './board-context';
import { type BoardColumn, positionAfter } from './board-cache';
import { TEMP_PREFIX } from './use-board-mutations';

export function AddColumn() {
  const { board, mutations } = useBoardContextValue();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const placeholder: BoardColumn = {
      id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
      boardId: board.id,
      name: trimmed.slice(0, 100),
      position: positionAfter(board.columns, board.columns.at(-1)?.id ?? null),
      version: 0,
      createdAt: now,
      updatedAt: now,
      cards: [],
    };
    void mutations.createColumn(placeholder.name, placeholder);
    setName('');
    setOpen(false);
  };

  return (
    <div className="w-72 shrink-0">
      {open ? (
        <form onSubmit={submit} className="bg-muted/60 space-y-2 rounded-xl p-3">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
            placeholder="Column name"
            aria-label="New column name"
            maxLength={100}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Add column
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          className="w-full justify-start border-dashed"
          onClick={() => setOpen(true)}
        >
          <PlusIcon aria-hidden />
          Add column
        </Button>
      )}
    </div>
  );
}
