import { mentionToken } from '@teamboard/shared';

/** The `@query` being typed just before the caret, if any (start of text or after whitespace). */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@[\]()]{0,30})$/.exec(before);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: caret - query.length - 1, query };
}

/** Members whose name starts with (or has a word starting with) the query, best first, max 6. */
export function matchMembers<T extends { userId: string; name: string }>(
  members: readonly T[],
  query: string,
  excludeId: string | null,
): T[] {
  const q = query.toLowerCase();
  const score = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) return 0;
    if (lower.split(/\s+/).some((word) => word.startsWith(q))) return 1;
    return -1;
  };
  return members
    .filter((m) => m.userId !== excludeId && score(m.name) >= 0)
    .sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name))
    .slice(0, 6);
}

/** Replaces `@query` with the mention token plus a space; returns the new text and caret. */
export function insertMention(
  text: string,
  mention: { start: number; query: string },
  member: { userId: string; name: string },
): { text: string; caret: number } {
  const token = `${mentionToken(member.name, member.userId)} `;
  const end = mention.start + 1 + mention.query.length;
  return {
    text: text.slice(0, mention.start) + token + text.slice(end),
    caret: mention.start + token.length,
  };
}
