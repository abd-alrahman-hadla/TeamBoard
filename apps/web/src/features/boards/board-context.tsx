'use client';

import type { BoardDetail, Member, Presence, PresenceViewer } from '@teamboard/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { BoardPermissions } from './permissions';
import type { BoardMutations } from './use-board-mutations';

export interface BoardContextValue {
  board: BoardDetail;
  permissions: BoardPermissions;
  members: Member[];
  memberById: ReadonlyMap<string, Member>;
  mutations: BoardMutations;
  /** Re-evaluated every minute so due badges and filters stay current. */
  now: Date;
  openCard: (cardId: string) => void;
  /** Signed-in user. */
  meId: string | null;
  presence: Presence | null;
  /** Other people who have this card open for editing. */
  editorsOf: (cardId: string) => PresenceViewer[];
  setEditing: (cardId: string | null) => void;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Other users editing `cardId`, with display names from presence. */
export function editorsFrom(
  presence: Presence | null,
  cardId: string,
  meId: string | null,
): PresenceViewer[] {
  const ids = presence?.editing[cardId] ?? [];
  return ids
    .filter((id) => id !== meId)
    .map((id) => presence?.viewers.find((v) => v.userId === id) ?? { userId: id, name: 'Someone' });
}

export function BoardProvider({
  value,
  children,
}: {
  value: Omit<BoardContextValue, 'memberById' | 'editorsOf'>;
  children: ReactNode;
}) {
  const memberById = useMemo(() => new Map(value.members.map((m) => [m.userId, m])), [value.members]);
  const editorsOf = useCallback(
    (cardId: string) => editorsFrom(value.presence, cardId, value.meId),
    [value.presence, value.meId],
  );
  const full = useMemo(() => ({ ...value, memberById, editorsOf }), [value, memberById, editorsOf]);
  return <BoardContext.Provider value={full}>{children}</BoardContext.Provider>;
}

export function useBoardContextValue(): BoardContextValue {
  const context = useContext(BoardContext);
  if (!context) throw new Error('useBoardContextValue must be used inside <BoardProvider>');
  return context;
}
