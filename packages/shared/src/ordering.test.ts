import { describe, expect, it } from 'vitest';
import { comparePositions, positionBetween } from './ordering';

describe('positionBetween', () => {
  it('creates a first key and keys around it', () => {
    const first = positionBetween(null, null);
    const before = positionBetween(null, first);
    const after = positionBetween(first, null);
    expect([after, first, before].sort(comparePositions)).toEqual([before, first, after]);
  });

  it('always lands strictly between its neighbours, even after many inserts at one spot', () => {
    let low = positionBetween(null, null);
    const high = positionBetween(low, null);
    for (let i = 0; i < 200; i += 1) {
      const mid = positionBetween(low, high);
      expect(comparePositions(low, mid)).toBe(-1);
      expect(comparePositions(mid, high)).toBe(-1);
      low = mid;
    }
  });

  it('rejects inverted bounds', () => {
    const a = positionBetween(null, null);
    const b = positionBetween(a, null);
    expect(() => positionBetween(b, a)).toThrow();
  });

  it('orders keys byte-wise (uppercase before lowercase), unlike locale collation', () => {
    expect(comparePositions('Zz', 'a0')).toBe(-1);
    expect(['a0', 'Zz', 'a1'].sort(comparePositions)).toEqual(['Zz', 'a0', 'a1']);
  });
});
