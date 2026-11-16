'use client';

import type { BoardDetail, Member } from '@teamboard/shared';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
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

export function BoardProvider({
  value,
  children,
}: {
  value: Omit<BoardContextValue, 'memberById'>;
  children: ReactNode;
}) {
  const memberById = useMemo(() => new Map(value.members.map((m) => [m.userId, m])), [value.members]);
  const full = useMemo(() => ({ ...value, memberById }), [value, memberById]);
  return <BoardContext.Provider value={full}>{children}</BoardContext.Provider>;
}

export function useBoardContextValue(): BoardContextValue {
  const context = useContext(BoardContext);
  if (!context) throw new Error('useBoardContextValue must be used inside <BoardProvider>');
  return context;
}
