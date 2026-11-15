import { comparePositions, positionBetween } from '@teamboard/shared';
import { AppException } from '../common/app.exception';
import { Prisma } from '../generated/prisma/client';
import {
  assertNotSelfAnchor,
  placementFrom,
  positionFor,
  type SiblingQueries,
  withPositionRetry,
} from './placement';

function siblingsOf(items: { id: string; position: string }[]): SiblingQueries {
  const sorted = [...items].sort((a, b) => comparePositions(a.position, b.position));
  return {
    find: (id) => Promise.resolve(sorted.find((i) => i.id === id) ?? null),
    firstAfter: (position) =>
      Promise.resolve(
        sorted.find((i) => position === null || comparePositions(i.position, position) > 0) ?? null,
      ),
    last: () => Promise.resolve(sorted.at(-1) ?? null),
  };
}

const a = positionBetween(null, null);
const b = positionBetween(a, null);
const c = positionBetween(b, null);
const items = [
  { id: 'A', position: a },
  { id: 'B', position: b },
  { id: 'C', position: c },
];

describe('positionFor', () => {
  it('appends after the last sibling', async () => {
    const key = await positionFor(siblingsOf(items), placementFrom(undefined));
    expect(comparePositions(key, c)).toBe(1);
  });

  it('puts afterId=null first', async () => {
    const key = await positionFor(siblingsOf(items), placementFrom(null));
    expect(comparePositions(key, a)).toBe(-1);
  });

  it('puts an item between the anchor and its next sibling', async () => {
    const key = await positionFor(siblingsOf(items), placementFrom('A'));
    expect(comparePositions(a, key)).toBe(-1);
    expect(comparePositions(key, b)).toBe(-1);
  });

  it('works in an empty parent', async () => {
    await expect(positionFor(siblingsOf([]), placementFrom(undefined))).resolves.toBe(
      positionBetween(null, null),
    );
    await expect(positionFor(siblingsOf([]), placementFrom(null))).resolves.toBe(positionBetween(null, null));
  });

  it('404s for an anchor outside the parent', async () => {
    await expect(positionFor(siblingsOf(items), placementFrom('elsewhere'))).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('assertNotSelfAnchor', () => {
  it('rejects placing an item after itself', () => {
    expect(() => assertNotSelfAnchor('A', placementFrom('A'))).toThrow(AppException);
    expect(() => assertNotSelfAnchor('A', placementFrom('B'))).not.toThrow();
  });
});

describe('withPositionRetry', () => {
  const clash = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  it('retries unique violations and returns the first success', async () => {
    const run = jest.fn().mockRejectedValueOnce(clash()).mockResolvedValueOnce('ok');
    await expect(withPositionRetry(run)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts', async () => {
    const run = jest.fn().mockRejectedValue(clash());
    await expect(withPositionRetry(run)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const run = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(withPositionRetry(run)).rejects.toThrow('boom');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
