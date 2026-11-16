'use client';

import type { Card, Member } from '@teamboard/shared';
import { MAX_LABELS } from '@teamboard/shared';
import { CheckIcon, PlusIcon, UsersIcon, XIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { DueBadge, LabelChip, MemberAvatar } from '../card-parts';
import { fromDueIso, toDueIso } from '../due-date';
import { Markdown } from './markdown';

/** Shared props: `editable` false renders the read-only (viewer) version. */
interface FieldProps {
  card: Card;
  editable: boolean;
  onSave: (
    patch: Partial<Pick<Card, 'title' | 'description' | 'labels' | 'dueDate' | 'assigneeIds'>>,
  ) => void;
}

export function TitleField({ card, editable, onSave }: FieldProps) {
  const [value, setValue] = useState(card.title);
  useEffect(() => setValue(card.title), [card.title]);

  if (!editable) return <span>{card.title}</span>;

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed) setValue(card.title);
    else if (trimmed !== card.title) onSave({ title: trimmed });
  };

  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.stopPropagation();
          setValue(card.title);
        }
      }}
      aria-label="Card title"
      maxLength={200}
      className="h-auto border-transparent px-1 py-0.5 text-lg font-semibold shadow-none hover:border-input focus-visible:border-input"
    />
  );
}

export function DescriptionField({ card, editable, onSave }: FieldProps) {
  const [draft, setDraft] = useState(card.description ?? '');
  const [tab, setTab] = useState<'write' | 'preview'>(card.description ? 'preview' : 'write');
  useEffect(() => setDraft(card.description ?? ''), [card.description]);

  if (!editable) {
    return card.description ? (
      <Markdown source={card.description} />
    ) : (
      <p className="text-muted-foreground text-sm">No description.</p>
    );
  }

  const dirty = draft !== (card.description ?? '');
  const save = () => {
    onSave({ description: draft.trim() === '' ? null : draft });
    setTab('preview');
  };

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as 'write' | 'preview')}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Description</h3>
        <TabsList className="h-8">
          <TabsTrigger value="write" className="text-xs">
            Write
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs">
            Preview
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="write" className="space-y-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && dirty) save();
          }}
          placeholder="Add a more detailed description… Markdown is supported."
          aria-label="Description (markdown)"
          className="min-h-32 font-mono text-sm"
          maxLength={20_000}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={!dirty}>
            Save
          </Button>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(card.description ?? '')}>
              Discard
            </Button>
          )}
          <span className="text-muted-foreground ml-auto text-xs">Markdown · Ctrl+Enter to save</span>
        </div>
      </TabsContent>
      <TabsContent value="preview">
        {draft.trim() ? (
          <Markdown source={draft} className="min-h-12 rounded-md border p-3" />
        ) : (
          <button
            type="button"
            onClick={() => setTab('write')}
            className="text-muted-foreground hover:bg-muted w-full rounded-md border border-dashed p-3 text-left text-sm"
          >
            Add a description…
          </button>
        )}
        {dirty && (
          <p className="text-muted-foreground mt-1 text-xs">Unsaved changes. Switch to Write to save.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}

export function LabelsField({ card, editable, onSave, suggestions }: FieldProps & { suggestions: string[] }) {
  const [value, setValue] = useState('');
  const listId = useId();
  const full = card.labels.length >= MAX_LABELS;

  const add = () => {
    const label = value.trim().slice(0, 32);
    setValue('');
    if (!label || card.labels.includes(label) || full) return;
    onSave({ labels: [...card.labels, label] });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" aria-label="Labels">
        {card.labels.length === 0 && !editable && <span className="text-muted-foreground text-sm">None</span>}
        {card.labels.map((label) => (
          <span key={label} className="inline-flex items-center">
            <LabelChip label={label} className={editable ? 'rounded-r-none pr-1' : ''} />
            {editable && (
              <button
                type="button"
                onClick={() => onSave({ labels: card.labels.filter((l) => l !== label) })}
                className="bg-secondary hover:bg-destructive/15 rounded-r-md px-1 py-[3px]"
                aria-label={`Remove label ${label}`}
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            )}
          </span>
        ))}
      </div>
      {editable && !full && (
        <div className="flex gap-1">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            list={listId}
            placeholder="Add label"
            aria-label="Add label"
            className="h-8"
            maxLength={32}
          />
          <datalist id={listId}>
            {suggestions
              .filter((s) => !card.labels.includes(s))
              .map((s) => (
                <option key={s} value={s} />
              ))}
          </datalist>
          <Button
            size="icon-sm"
            variant="outline"
            onClick={add}
            aria-label="Add label"
            disabled={!value.trim()}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}

export function DueDateField({ card, editable, onSave, now }: FieldProps & { now: Date }) {
  const id = useId();
  if (!editable) {
    return card.dueDate ? (
      <DueBadge iso={card.dueDate} now={now} />
    ) : (
      <span className="text-muted-foreground text-sm">None</span>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        <Input
          id={id}
          type="date"
          value={card.dueDate ? fromDueIso(card.dueDate) : ''}
          onChange={(event) => onSave({ dueDate: event.target.value ? toDueIso(event.target.value) : null })}
          aria-label="Due date"
          className="h-8"
        />
        {card.dueDate && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onSave({ dueDate: null })}
            aria-label="Clear due date"
          >
            <XIcon aria-hidden />
          </Button>
        )}
      </div>
      {card.dueDate && <DueBadge iso={card.dueDate} now={now} />}
    </div>
  );
}

export function AssigneesField({ card, editable, onSave, members }: FieldProps & { members: Member[] }) {
  const id = useId();
  const assigned = members.filter((m) => card.assigneeIds.includes(m.userId));
  const toggle = (userId: string, checked: boolean) =>
    onSave({
      assigneeIds: checked ? [...card.assigneeIds, userId] : card.assigneeIds.filter((a) => a !== userId),
    });

  return (
    <div className="space-y-2">
      {assigned.length === 0 ? (
        <span className="text-muted-foreground text-sm">Nobody</span>
      ) : (
        <ul className="space-y-1" aria-label="Assignees">
          {assigned.map((member) => (
            <li key={member.userId} className="flex items-center gap-2 text-sm">
              <MemberAvatar member={member} />
              <span className="truncate">{member.name}</span>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="w-full justify-start">
              <UsersIcon aria-hidden />
              Assign members
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {members.map((member) => {
                const optionId = `${id}-${member.userId}`;
                const checked = card.assigneeIds.includes(member.userId);
                return (
                  <li
                    key={member.userId}
                    className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <Checkbox
                      id={optionId}
                      checked={checked}
                      onCheckedChange={(next) => toggle(member.userId, next === true)}
                    />
                    <Label
                      htmlFor={optionId}
                      className="flex flex-1 cursor-pointer items-center gap-2 font-normal"
                    >
                      <MemberAvatar member={member} />
                      <span className="truncate">{member.name}</span>
                      {checked && <CheckIcon className="ml-auto size-3.5" aria-hidden />}
                    </Label>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
