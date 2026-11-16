import {
  type ActivityPage,
  activityPageSchema,
  type Board,
  type BoardDetail,
  boardDetailSchema,
  boardSchema,
  type Card,
  cardSchema,
  type Column,
  columnSchema,
  type Comment,
  commentSchema,
  type CreateCardInput,
  type Member,
  memberSchema,
  type MoveCardInput,
  type MyWorkspace,
  myWorkspaceSchema,
  type UpdateCardInput,
} from '@teamboard/shared';
import { z } from 'zod';
import { apiJson, apiVoid } from '@/lib/api-client';

export const listMyWorkspaces = (): Promise<MyWorkspace[]> =>
  apiJson('/workspaces', z.array(myWorkspaceSchema));
export const getWorkspace = (workspaceId: string): Promise<MyWorkspace> =>
  apiJson(`/workspaces/${workspaceId}`, myWorkspaceSchema);
export const getMembers = (workspaceId: string): Promise<Member[]> =>
  apiJson(`/workspaces/${workspaceId}/members`, z.array(memberSchema));
export const listBoards = (workspaceId: string): Promise<Board[]> =>
  apiJson(`/workspaces/${workspaceId}/boards`, z.array(boardSchema));
export const getBoard = (boardId: string): Promise<BoardDetail> =>
  apiJson(`/boards/${boardId}`, boardDetailSchema);

export const createCard = (columnId: string, input: CreateCardInput): Promise<Card> =>
  apiJson(`/columns/${columnId}/cards`, cardSchema, { method: 'POST', body: input });
export const updateCard = (cardId: string, input: UpdateCardInput): Promise<Card> =>
  apiJson(`/cards/${cardId}`, cardSchema, { method: 'PATCH', body: input });
export const moveCard = (cardId: string, input: MoveCardInput): Promise<Card> =>
  apiJson(`/cards/${cardId}/move`, cardSchema, { method: 'POST', body: input });
export const deleteCard = (cardId: string): Promise<void> =>
  apiVoid(`/cards/${cardId}`, { method: 'DELETE' });

export const createColumn = (boardId: string, name: string): Promise<Column> =>
  apiJson(`/boards/${boardId}/columns`, columnSchema, { method: 'POST', body: { name } });
export const renameColumn = (columnId: string, name: string): Promise<Column> =>
  apiJson(`/columns/${columnId}`, columnSchema, { method: 'PATCH', body: { name } });
export const moveColumn = (columnId: string, afterId: string | null): Promise<Column> =>
  apiJson(`/columns/${columnId}/move`, columnSchema, { method: 'POST', body: { afterId } });
export const deleteColumn = (columnId: string): Promise<void> =>
  apiVoid(`/columns/${columnId}`, { method: 'DELETE' });

export const listComments = (cardId: string): Promise<Comment[]> =>
  apiJson(`/cards/${cardId}/comments`, z.array(commentSchema));
export const addComment = (cardId: string, body: string): Promise<Comment> =>
  apiJson(`/cards/${cardId}/comments`, commentSchema, { method: 'POST', body: { body } });
export const editComment = (commentId: string, body: string): Promise<Comment> =>
  apiJson(`/comments/${commentId}`, commentSchema, { method: 'PATCH', body: { body } });
export const deleteComment = (commentId: string): Promise<void> =>
  apiVoid(`/comments/${commentId}`, { method: 'DELETE' });

export const cardActivity = (cardId: string, cursor?: string): Promise<ActivityPage> =>
  apiJson(`/cards/${cardId}/activity${cursor ? `?cursor=${cursor}` : ''}`, activityPageSchema);
