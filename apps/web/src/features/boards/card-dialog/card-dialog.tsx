'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBoardContextValue } from '../board-context';
import { boardLabels, findCard } from '../board-cache';
import { TitleField } from './card-fields';
import { CardDetails } from './card-details';

/** The card modal. Which card is open lives in the URL (?card=<id>), so it can be linked to. */
export function CardDialog({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const { board, members, permissions, mutations, now } = useBoardContextValue();
  const card = cardId ? findCard(board, cardId) : undefined;
  const columnName = (id: string) => board.columns.find((c) => c.id === id)?.name;

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
