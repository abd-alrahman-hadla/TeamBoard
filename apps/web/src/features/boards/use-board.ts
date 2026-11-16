'use client';

import type { Member } from '@teamboard/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getBoard, getMembers, getWorkspace } from './board-api';
import { type BoardPermissions, boardPermissions } from './permissions';
import { queryKeys } from './query-keys';

export function useBoardQuery(boardId: string) {
  return useQuery({ queryKey: queryKeys.board(boardId), queryFn: () => getBoard(boardId) });
}

/** The caller's role and the member list for the board's workspace (once the board has loaded). */
export function useBoardContext(workspaceId: string | undefined): {
  permissions: BoardPermissions;
  members: Member[];
  workspaceName: string | undefined;
  ready: boolean;
} {
  const workspace = useQuery({
    queryKey: queryKeys.workspace(workspaceId ?? ''),
    queryFn: () => getWorkspace(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  });
  const members = useQuery({
    queryKey: queryKeys.members(workspaceId ?? ''),
    queryFn: () => getMembers(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  });
  const permissions = useMemo(() => boardPermissions(workspace.data?.role ?? null), [workspace.data?.role]);
  return {
    permissions,
    members: members.data ?? [],
    workspaceName: workspace.data?.name,
    ready: workspace.isSuccess && members.isSuccess,
  };
}
