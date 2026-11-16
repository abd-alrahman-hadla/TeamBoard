import { activeMention, insertMention, matchMembers } from './mention-logic';

const ADA = { userId: '0195a000-0000-7000-8000-00000000000a', name: 'Ada Lovelace' };
const BOB = { userId: '0195a000-0000-7000-8000-00000000000b', name: 'Bob Stone' };
const ALAN = { userId: '0195a000-0000-7000-8000-00000000000c', name: 'Alan Turing' };

describe('activeMention', () => {
  it('finds an @query right before the caret', () => {
    expect(activeMention('hi @Ad', 6)).toEqual({ start: 3, query: 'Ad' });
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('ignores emails, finished words and text after the caret', () => {
    expect(activeMention('ada@example', 11)).toBeNull();
    expect(activeMention('hi @Ada done', 12)).toBeNull();
    expect(activeMention('hi @Ada', 2)).toBeNull();
  });
});

describe('matchMembers', () => {
  it('ranks name prefixes before word prefixes and skips me', () => {
    expect(matchMembers([BOB, ALAN, ADA], 'a', null).map((m) => m.name)).toEqual([
      'Ada Lovelace',
      'Alan Turing',
    ]);
    expect(matchMembers([BOB, ALAN, ADA], 'st', null)).toEqual([BOB]);
    expect(matchMembers([BOB, ADA], '', ADA.userId)).toEqual([BOB]);
  });
});

describe('insertMention', () => {
  it('replaces the query with a token and moves the caret after it', () => {
    const result = insertMention('hi @Ad!', { start: 3, query: 'Ad' }, ADA);
    expect(result.text).toBe(`hi @[Ada Lovelace](${ADA.userId}) !`);
    expect(result.caret).toBe(result.text.length - 1);
  });
});
