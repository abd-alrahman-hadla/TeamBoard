'use client';

import type { Member } from '@teamboard/shared';
import { type ComponentProps, type KeyboardEvent, useId, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { activeMention, insertMention, matchMembers } from './mention-logic';

type MentionTextareaProps = Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  members: readonly Member[];
  meId: string | null;
};

/**
 * Textarea with `@` autocomplete over workspace members (a combobox). Picking someone inserts
 * `@[Name](userId)`, which the server turns into a notification.
 */
export function MentionTextarea({
  value,
  onValueChange,
  members,
  meId,
  onKeyDown,
  ...props
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  const mention = activeMention(value, caret);
  const options = mention && mention.start !== dismissed ? matchMembers(members, mention.query, meId) : [];
  const open = options.length > 0;
  const highlighted = Math.min(active, options.length - 1);

  const pick = (member: Member) => {
    if (!mention) return;
    const next = insertMention(value, mention, member);
    onValueChange(next.text);
    setCaret(next.caret);
    setActive(0);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((highlighted + step + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const member = options[highlighted];
        if (member && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          pick(member);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation(); // close the list, not the card dialog
        setDismissed(mention?.start ?? null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${highlighted}` : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          setCaret(event.target.selectionStart);
          setActive(0);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention someone"
          className="bg-popover text-popover-foreground absolute z-50 mt-1 w-64 rounded-md border p-1 shadow-md"
        >
          {options.map((member, i) => (
            <li
              key={member.userId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              className={cn('cursor-pointer rounded px-2 py-1.5 text-sm', i === highlighted && 'bg-accent')}
              onMouseDown={(event) => {
                event.preventDefault(); // keep focus in the textarea
                pick(member);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {member.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
