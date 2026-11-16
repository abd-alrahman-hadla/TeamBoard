'use client';

import type { Card, Member, UpdateCardInput } from '@teamboard/shared';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BoardPermissions } from '../permissions';
import { ActivityPanel } from './activity-panel';
import { AssigneesField, DescriptionField, DueDateField, LabelsField } from './card-fields';
import { CommentsPanel } from './comments-panel';

export interface CardDetailsProps {
  card: Card;
  columnName: (id: string) => string | undefined;
  members: Member[];
  labelSuggestions: string[];
  permissions: BoardPermissions;
  now: Date;
  onSave: (patch: UpdateCardInput) => void;
  onDelete: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Body of the card modal (everything but the title). `permissions.canEditCards` false = read-only. */
export function CardDetails({
  card,
  columnName,
  members,
  labelSuggestions,
  permissions,
  now,
  onSave,
  onDelete,
}: CardDetailsProps) {
  const editable = permissions.canEditCards;
  const [tab, setTab] = useState('comments');

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_14rem]">
      <div className="min-w-0 space-y-6">
        {editable ? (
          <DescriptionField card={card} editable onSave={onSave} />
        ) : (
          <Section title="Description">
            <DescriptionField card={card} editable={false} onSave={onSave} />
          </Section>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="comments" className="pt-2">
            <CommentsPanel
              cardId={card.id}
              role={permissions.role}
              canComment={permissions.canComment}
              now={now}
            />
          </TabsContent>
          <TabsContent value="activity" className="pt-2">
            <ActivityPanel cardId={card.id} columnName={columnName} now={now} />
          </TabsContent>
        </Tabs>
      </div>

      <aside className="space-y-5" aria-label="Card properties">
        <Section title="Column">
          <p className="text-sm">{columnName(card.columnId) ?? '—'}</p>
        </Section>
        <Section title="Assignees">
          <AssigneesField card={card} editable={editable} onSave={onSave} members={members} />
        </Section>
        <Section title="Labels">
          <LabelsField card={card} editable={editable} onSave={onSave} suggestions={labelSuggestions} />
        </Section>
        <Section title="Due date">
          <DueDateField card={card} editable={editable} onSave={onSave} now={now} />
        </Section>
        {editable && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive w-full justify-start">
                <Trash2Icon aria-hidden />
                Delete card
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{card.title}” and its comments will be deleted. This can’t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </aside>
    </div>
  );
}
