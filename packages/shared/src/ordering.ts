import { generateKeyBetween } from 'fractional-indexing';

/**
 * Fractional-index key strictly between `before` and `after` (either may be null for an open end).
 * Keys are base-62 ASCII and must be compared byte-wise (plain `<` in JS, COLLATE "C" in Postgres).
 */
export function positionBetween(before: string | null, after: string | null): string {
  // fractional-indexing v4 silently swaps inverted bounds; we'd rather fail loudly on a neighbour-lookup bug.
  if (before !== null && after !== null && before >= after) {
    throw new Error(`Invalid position bounds: "${before}" must sort before "${after}"`);
  }
  return generateKeyBetween(before, after);
}

/** Byte-order comparison matching Postgres COLLATE "C". */
export function comparePositions(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
