'use client';

import { PencilIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBoardContextValue } from '../board-context';
import { boardLabels, findCard } from '../board-cache';
import { editingLabel } from '../realtime/presence-avatars';
import { TitleField } from './card-fields';
import { CardDetails } from './card-details';

/** The card modal. Which card is open lives in the URL (?card=<id>), so it can be linked to. */
export function CardDialog({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const { board, members, permissions, mutations, now, editorsOf, setEditing } = useBoardContextValue();
  const card = cardId ? findCard(board, cardId) : undefined;
  const openId = card?.id ?? null;
  const columnName = (id: string) => board.columns.find((c) => c.id === id)?.name;

  // Editors tell the others which card they have open (viewers can't edit, so they don't).
  useEffect(() => {
    if (!openId || !permissions.canEditCards) return;
    setEditing(openId);
    return () => setEditing(null);
  }, [openId, permissions.canEditCards, setEditing]);

  const others = card ? editorsOf(card.id) : [];

  return (
    <Dialog open={card !== undefined} onOpenChange={(open) => !open && onClose()}>
      {card && (
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-3xl"
          // Focus the dialog itself rather than selecting the title text, so a stray key can't overwrite it.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="pr-6">
              <TitleField
                card={card}
                editable={permissions.canEditCards}
                onSave={(patch) => void mutations.updateCard(card.id, patch)}
              />
            </DialogTitle>
            <DialogDescription className="sr-only">
              Card in column {columnName(card.columnId)}
              {permissions.canEditCards ? '' : '. You have read-only access.'}
            </DialogDescription>
            {others.length > 0 && (
              <p
                role="status"
                className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
                data-testid="dialog-editing"
              >
                <PencilIcon className="size-3" aria-hidden />
                {editingLabel(others)} this card. Your changes and theirs both save; the latest edit to a
                field wins.
              </p>
            )}
          </DialogHeader>
          <CardDetails
            card={card}
            columnName={columnName}
            members={members}
            labelSuggestions={boardLabels(board)}
            permissions={permissions}
            now={now}
            onSave={(patch) => void mutations.updateCard(card.id, patch)}
            onDelete={() => {
              onClose();
              void mutations.deleteCard(card.id);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
