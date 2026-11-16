export const queryKeys = {
  workspaces: () => ['workspaces'] as const,
  workspace: (workspaceId: string) => ['workspace', workspaceId] as const,
  members: (workspaceId: string) => ['workspace', workspaceId, 'members'] as const,
  boards: (workspaceId: string) => ['workspace', workspaceId, 'boards'] as const,
  board: (boardId: string) => ['board', boardId] as const,
  comments: (cardId: string) => ['card', cardId, 'comments'] as const,
  cardActivity: (cardId: string) => ['card', cardId, 'activity'] as const,
};

/** Every mutation that touches a board shares this key, so we can tell when a burst of changes has settled. */
export const boardMutationKey = (boardId: string) => ['board', boardId, 'mutation'] as const;
