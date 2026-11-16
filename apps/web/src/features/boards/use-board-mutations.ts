'use client';

import type { BoardDetail, Card, Column, CreateCardInput, UpdateCardInput } from '@teamboard/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/error-message';
import * as api from './board-api';
import {
  type BoardColumn,
  findCard,
  findColumn,
  insertCard,
  insertColumn,
  moveCardTo,
  moveColumnTo,
  patchCard,
  patchColumn,
  removeCard,
  removeColumn,
  replaceCard,
  replaceColumn,
} from './board-cache';
import { boardMutationKey, queryKeys } from './query-keys';

export const TEMP_PREFIX = 'temp-';
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

type Undo = (board: BoardDetail) => BoardDetail;

/**
 * Optimistic board mutations.
 *
 * Each change is applied to the cache *before* the request (after cancelling in-flight refetches,
 * which would otherwise overwrite it). On failure only the touched entity is restored, so a
 * rejected move can't undo a newer, successful one. Then a toast explains why and the board is
 * refetched. When the last pending change settles, the board is refetched once to reconcile.
 */
export function useBoardMutations(boardId: string) {
  const queryClient = useQueryClient();
  const key = useMemo(() => queryKeys.board(boardId), [boardId]);
  const mutationKey = useMemo(() => boardMutationKey(boardId), [boardId]);

  const update = useCallback(
    (fn: (board: BoardDetail) => BoardDetail) =>
      queryClient.setQueryData<BoardDetail>(key, (board) => (board ? fn(board) : board)),
    [queryClient, key],
  );

  /** Cancel refetches, then apply; returns the current board (for snapshots). */
  const prepare = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: key });
    return queryClient.getQueryData<BoardDetail>(key);
  }, [queryClient, key]);

  const onError = useCallback(
    (error: unknown, _vars: unknown, context: { undo: Undo } | undefined) => {
      if (context) update(context.undo);
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    [update, queryClient, key],
  );

  const onSettled = useCallback(() => {
    if (queryClient.isMutating({ mutationKey }) === 1) {
      void queryClient.invalidateQueries({ queryKey: key });
      // An open card's history (only active queries refetch).
      void queryClient.invalidateQueries({ queryKey: ['card'] });
    }
  }, [queryClient, mutationKey, key]);

  const run = useMutation({
    mutationKey,
    mutationFn: ({
      request,
    }: {
      request: () => Promise<unknown>;
      undo: Undo;
      commit: (result: unknown) => Undo;
    }) => request(),
    onMutate: ({ undo }) => ({ undo }),
    onSuccess: (result, { commit }) => update(commit(result)),
    onError,
    onSettled,
  });

  /** Applies `optimistic` now, sends `request`, and commits or undoes when it settles. */
  const perform = useCallback(
    async <T>(options: {
      optimistic: (board: BoardDetail) => BoardDetail;
      undo: (before: BoardDetail) => Undo;
      request: () => Promise<T>;
      commit?: (result: T) => Undo;
    }): Promise<void> => {
      const before = await prepare();
      if (!before) return;
      update(options.optimistic);
      run.mutate({
        request: options.request,
        undo: options.undo(before),
        commit: (result) => (options.commit ? options.commit(result as T) : (board) => board),
      });
    },
    [prepare, update, run],
  );

  const moveCard = useCallback(
    (cardId: string, columnId: string, afterId: string | null) =>
      perform({
        optimistic: (board) => moveCardTo(board, cardId, columnId, afterId),
        undo: (before) => restoreCard(before, cardId),
        request: () => api.moveCard(cardId, { columnId, afterId }),
        commit: (card: Card) => (board) => replaceCard(board, card),
      }),
    [perform],
  );

  const updateCard = useCallback(
    (cardId: string, input: UpdateCardInput) =>
      perform({
        optimistic: (board) => patchCard(board, cardId, input),
        undo: (before) => restoreCard(before, cardId),
        request: () => api.updateCard(cardId, input),
        commit: (card: Card) => (board) => replaceCard(board, card),
      }),
    [perform],
  );

  const createCard = useCallback(
    (columnId: string, input: CreateCardInput, placeholder: Card) =>
      perform({
        optimistic: (board) => insertCard(board, placeholder),
        undo: () => (board) => removeCard(board, placeholder.id),
        request: () => api.createCard(columnId, input),
        commit: (card: Card) => (board) => insertCard(removeCard(board, placeholder.id), card),
      }),
    [perform],
  );

  const deleteCard = useCallback(
    (cardId: string) =>
      perform({
        optimistic: (board) => removeCard(board, cardId),
        undo: (before) => restoreCard(before, cardId),
        request: () => api.deleteCard(cardId),
      }),
    [perform],
  );

  const moveColumn = useCallback(
    (columnId: string, afterId: string | null) =>
      perform({
        optimistic: (board) => moveColumnTo(board, columnId, afterId),
        undo: (before) => restoreColumn(before, columnId),
        request: () => api.moveColumn(columnId, afterId),
        commit: (column: Column) => (board) => replaceColumn(board, column),
      }),
    [perform],
  );

  const renameColumn = useCallback(
    (columnId: string, name: string) =>
      perform({
        optimistic: (board) => patchColumn(board, columnId, { name }),
        undo: (before) => restoreColumn(before, columnId),
        request: () => api.renameColumn(columnId, name),
        commit: (column: Column) => (board) => replaceColumn(board, column),
      }),
    [perform],
  );

  const createColumn = useCallback(
    (name: string, placeholder: BoardColumn) =>
      perform({
        optimistic: (board) => insertColumn(board, placeholder),
        undo: () => (board) => removeColumn(board, placeholder.id),
        request: () => api.createColumn(boardId, name),
        commit: (column: Column) => (board) =>
          insertColumn(removeColumn(board, placeholder.id), { ...column, cards: [] }),
      }),
    [perform, boardId],
  );

  const deleteColumn = useCallback(
    (columnId: string) =>
      perform({
        optimistic: (board) => removeColumn(board, columnId),
        undo: (before) => restoreColumn(before, columnId, true),
        request: () => api.deleteColumn(columnId),
      }),
    [perform],
  );

  return {
    moveCard,
    updateCard,
    createCard,
    deleteCard,
    moveColumn,
    renameColumn,
    createColumn,
    deleteColumn,
  };
}

export type BoardMutations = ReturnType<typeof useBoardMutations>;

/** Undo for one card: put back the snapshot (or drop it if it didn't exist). */
function restoreCard(before: BoardDetail, cardId: string): Undo {
  const previous = findCard(before, cardId);
  return (board) => (previous ? replaceCard(board, previous) : removeCard(board, cardId));
}

/** Undo for one column; `withCards` also restores its cards (after a delete). */
function restoreColumn(before: BoardDetail, columnId: string, withCards = false): Undo {
  const previous = findColumn(before, columnId);
  return (board) => {
    if (!previous) return removeColumn(board, columnId);
    return withCards ? insertColumn(board, previous) : replaceColumn(board, previous);
  };
}
