'use client';

import type { PresenceViewer } from '@teamboard/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { initials } from '../card-parts';

const MAX_SHOWN = 5;

/** "Who's here": you first, then others, up to five avatars plus a count. */
export function PresenceAvatars({
  viewers,
  meId,
  connected,
}: {
  viewers: PresenceViewer[];
  meId: string | null;
  connected: boolean | null;
}) {
  if (connected === null) return null;
  if (!connected) {
    return (
      <span className="text-muted-foreground text-xs" role="status" data-testid="realtime-status">
        Reconnecting…
      </span>
    );
  }
  const ordered = [...viewers].sort((a, b) => Number(b.userId === meId) - Number(a.userId === meId));
  const shown = ordered.slice(0, MAX_SHOWN);
  const hidden = ordered.length - shown.length;
  const names = ordered.map((v) => (v.userId === meId ? 'You' : v.name));

  return (
    <div className="flex items-center gap-2" data-testid="presence">
      <span className="sr-only" role="status">
        Viewing now: {names.join(', ')}
      </span>
      <div className="flex -space-x-2" aria-hidden>
        {shown.map((viewer) => (
          <Tooltip key={viewer.userId}>
            <TooltipTrigger asChild>
              <Avatar
                className={cn(
                  'ring-background size-7 text-[11px] ring-2',
                  viewer.userId === meId && 'ring-primary/40',
                )}
                data-testid="presence-avatar"
                data-user-id={viewer.userId}
              >
                <AvatarFallback className="bg-secondary font-medium">{initials(viewer.name)}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{viewer.userId === meId ? `${viewer.name} (you)` : viewer.name}</TooltipContent>
          </Tooltip>
        ))}
        {hidden > 0 && (
          <span className="bg-muted ring-background flex size-7 items-center justify-center rounded-full text-[11px] ring-2">
            +{hidden}
          </span>
        )}
      </div>
    </div>
  );
}

/** "Ada is editing" / "Ada and Bo are editing" */
export function editingLabel(editors: PresenceViewer[]): string {
  const names = editors.map((e) => e.name.split(' ')[0] ?? e.name);
  if (names.length === 1) return `${names[0] ?? ''} is editing`;
  if (names.length === 2) return `${names[0] ?? ''} and ${names[1] ?? ''} are editing`;
  return `${names[0] ?? ''} and ${names.length - 1} others are editing`;
}
