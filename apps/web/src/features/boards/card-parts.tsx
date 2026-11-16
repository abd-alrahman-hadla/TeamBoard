'use client';

import type { Member } from '@teamboard/shared';
import { CalendarIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { dueStatus, formatDue } from './due-date';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?';
}

/** Stable, readable colour per user (8 hues). */
const AVATAR_COLOURS = [
  'bg-rose-100 text-rose-900',
  'bg-amber-100 text-amber-900',
  'bg-lime-100 text-lime-900',
  'bg-emerald-100 text-emerald-900',
  'bg-cyan-100 text-cyan-900',
  'bg-blue-100 text-blue-900',
  'bg-violet-100 text-violet-900',
  'bg-fuchsia-100 text-fuchsia-900',
];

function colourFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length] ?? AVATAR_COLOURS[0] ?? '';
}

export function MemberAvatar({ member, size = 'sm' }: { member: Member; size?: 'sm' | 'md' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar
          className={cn(size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs', 'ring-background ring-2')}
        >
          <AvatarFallback className={cn('font-medium', colourFor(member.userId))}>
            {initials(member.name)}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{member.name}</TooltipContent>
    </Tooltip>
  );
}

export function LabelChip({ label, className }: { label: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('px-1.5 py-0 text-[11px] font-medium', className)}>
      {label}
    </Badge>
  );
}

const DUE_STYLES = {
  overdue: 'bg-red-100 text-red-800 border-red-200',
  today: 'bg-amber-100 text-amber-900 border-amber-200',
  soon: 'bg-yellow-50 text-yellow-900 border-yellow-200',
  later: 'bg-muted text-muted-foreground border-transparent',
} as const;

export function DueBadge({ iso, now }: { iso: string; now: Date }) {
  const status = dueStatus(iso, now);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        DUE_STYLES[status],
      )}
      title={new Date(iso).toLocaleDateString()}
    >
      <CalendarIcon className="size-3" aria-hidden />
      <span>
        {status === 'overdue' ? 'Overdue · ' : ''}
        {formatDue(iso, now)}
      </span>
    </span>
  );
}
