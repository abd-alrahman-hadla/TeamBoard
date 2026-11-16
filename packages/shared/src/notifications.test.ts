import { describe, expect, it } from 'vitest';
import {
  describeNotification,
  mentionsToLinks,
  mentionToken,
  type Notification,
  parseMentions,
  stripMentions,
} from './notifications';

const ADA = '0195a000-0000-7000-8000-00000000000a';
const BOB = '0195a000-0000-7000-8000-00000000000b';

describe('mentions', () => {
  it('builds tokens that survive odd names', () => {
    expect(mentionToken('Ada Lovelace', ADA)).toBe(`@[Ada Lovelace](${ADA})`);
    expect(mentionToken('Weird [name] (x)', ADA)).toBe(`@[Weird name x](${ADA})`);
  });

  it('parses distinct mentions in order', () => {
    const body = `Hi ${mentionToken('Bob', BOB)} and ${mentionToken('Ada', ADA)}, ping ${mentionToken('Bob', BOB)}`;
    expect(parseMentions(body)).toEqual([BOB, ADA]);
  });

  it('ignores plain @words, emails and malformed tokens', () => {
    expect(parseMentions('mail ada@example.com or @Ada or @[Ada](not-an-id)')).toEqual([]);
  });

  it('renders tokens as @Name or as mention links', () => {
    const body = `Thanks ${mentionToken('Ada', ADA)}!`;
    expect(stripMentions(body)).toBe('Thanks @Ada!');
    expect(mentionsToLinks(body)).toBe(`Thanks [@Ada](mention:${ADA})!`);
  });
});

describe('describeNotification', () => {
  const base: Notification = {
    id: '0195a000-0000-7000-8000-000000000001',
    type: 'ASSIGNED',
    actor: { id: ADA, name: 'Ada' },
    workspaceId: '0195a000-0000-7000-8000-000000000002',
    boardId: '0195a000-0000-7000-8000-000000000003',
    cardId: '0195a000-0000-7000-8000-000000000004',
    commentId: null,
    cardTitle: 'Login page',
    boardName: 'Launch',
    excerpt: null,
    readAt: null,
    createdAt: '2026-11-16T10:00:00.000Z',
  };

  it('describes assignments and mentions', () => {
    expect(describeNotification(base)).toBe("Ada assigned you to 'Login page'");
    expect(describeNotification({ ...base, type: 'MENTIONED', actor: null })).toBe(
      "Someone mentioned you in 'Login page'",
    );
  });
});
