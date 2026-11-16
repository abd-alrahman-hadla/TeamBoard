import type { BoardDetail, BoardEvent, Comment } from '@teamboard/shared';
import {
  findCard,
  findColumn,
  insertColumn,
  removeCard,
  removeColumn,
  replaceCard,
  replaceColumn,
} from '../board-cache';

/** Events that change the cached board itself (the rest are handled by the realtime hook). */
export type BoardCacheEvent = Extract<
  BoardEvent,
  { type: `card.${string}` | `column.${string}` | 'board.updated' }
>;

export function isBoardCacheEvent(event: BoardEvent): event is BoardCacheEvent {
  return event.type.startsWith('card.') || event.type.startsWith('column.') || event.type === 'board.updated';
}

/** True when the cache already has this version (or a newer one) of the entity. */
function isStale(current: { version: number } | undefined, incoming: { version: number }): boolean {
  return current !== undefined && current.version >= incoming.version;
}

/**
 * Applies another client's change to the cached board. Idempotent and order-safe: an event
 * carrying a version the cache already has (or has passed) is ignored.
 */
export function applyBoardEvent(board: BoardDetail, event: BoardCacheEvent): BoardDetail {
  switch (event.type) {
    case 'card.created':
    case 'card.updated':
    case 'card.moved': {
      const { card } = event.payload;
      if (isStale(findCard(board, card.id), card)) return board;
      if (!findColumn(board, card.columnId)) return board; // column not loaded (yet); the next refetch fixes it
      return replaceCard(board, card);
    }
    case 'card.deleted':
      return findCard(board, event.payload.cardId) ? removeCard(board, event.payload.cardId) : board;
    case 'column.created':
    case 'column.updated':
    case 'column.moved': {
      const { column } = event.payload;
      const current = findColumn(board, column.id);
      if (isStale(current, column)) return board;
      return current ? replaceColumn(board, column) : insertColumn(board, { ...column, cards: [] });
    }
    case 'column.deleted':
      return findColumn(board, event.payload.columnId) ? removeColumn(board, event.payload.columnId) : board;
    case 'board.updated': {
      const { board: next } = event.payload;
      if (board.version >= next.version) return board;
      return {
        ...board,
        name: next.name,
        description: next.description,
        version: next.version,
        updatedAt: next.updatedAt,
      };
    }
  }
}

/** Applies a comment event to a card's cached thread (if that thread is loaded). */
export function applyCommentEvent(
  comments: Comment[],
  event: Extract<BoardEvent, { type: `comment.${string}` }>,
): Comment[] {
  switch (event.type) {
    case 'comment.created':
      return comments.some((c) => c.id === event.payload.comment.id)
        ? comments
        : [...comments, event.payload.comment];
    case 'comment.updated':
      return comments.map((c) => (c.id === event.payload.comment.id ? event.payload.comment : c));
    case 'comment.deleted':
      return comments.filter((c) => c.id !== event.payload.commentId);
  }
}
