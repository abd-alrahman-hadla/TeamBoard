import { ERROR_CODES, positionBetween } from '@teamboard/shared';
import { badRequest, isUniqueViolation, notFound } from '../common/errors';
import type { Prisma } from '../generated/prisma/client';

/** Where an item goes among its siblings. */
export type Placement = { kind: 'after'; afterId: string | null } | { kind: 'end' };

export function placementFrom(afterId: string | null | undefined): Placement {
  return afterId === undefined ? { kind: 'end' } : { kind: 'after', afterId };
}

interface Positioned {
  position: string;
}

/** Sibling lookups within one parent (a board's columns, or a column's cards), excluding the item being moved. */
export interface SiblingQueries {
  /** The sibling with this id, or null if it isn't in this parent. */
  find(id: string): Promise<Positioned | null>;
  /** The first sibling strictly after `position` (or the first overall when null). */
  firstAfter(position: string | null): Promise<Positioned | null>;
  last(): Promise<Positioned | null>;
}

/**
 * Computes the fractional key for a placement. Only the moved/created row gets this key, so
 * a move updates exactly one row. An anchor outside the parent is a 404 (it may belong to
 * another workspace, and we never confirm that).
 */
export async function positionFor(siblings: SiblingQueries, placement: Placement): Promise<string> {
  if (placement.kind === 'end') {
    const last = await siblings.last();
    return positionBetween(last?.position ?? null, null);
  }
  if (placement.afterId === null) {
    const first = await siblings.firstAfter(null);
    return positionBetween(null, first?.position ?? null);
  }
  const anchor = await siblings.find(placement.afterId);
  if (!anchor) throw notFound();
  const next = await siblings.firstAfter(anchor.position);
  return positionBetween(anchor.position, next?.position ?? null);
}

export function assertNotSelfAnchor(itemId: string, placement: Placement): void {
  if (placement.kind === 'after' && placement.afterId === itemId) {
    throw badRequest(ERROR_CODES.invalidMove, 'An item cannot be placed after itself');
  }
}

/**
 * Serialises placements within one parent: concurrent inserts/moves into the same column (or board)
 * queue on the parent row's lock instead of computing the same key. The lock is a read lock on the
 * parent (`FOR UPDATE`), not a write, so a move still writes only the moved row.
 * Under READ COMMITTED, each queued transaction then sees the previous one's committed key.
 */
export async function lockColumnForPlacement(tx: Prisma.TransactionClient, columnId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM columns WHERE id = ${columnId}::uuid FOR UPDATE`;
}

export async function lockBoardForPlacement(tx: Prisma.TransactionClient, boardId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM boards WHERE id = ${boardId}::uuid FOR UPDATE`;
}

const MAX_ATTEMPTS = 3;

/**
 * Safety net on top of the parent lock: if two writers still compute the same key, one hits the
 * (parent, position) unique index, and re-running the whole transaction re-reads the neighbours.
 */
export async function withPositionRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
