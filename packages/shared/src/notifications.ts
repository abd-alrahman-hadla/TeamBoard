import { z } from 'zod';
import { idSchema, timestampSchema, userSummarySchema } from './schemas/common';

// ---------- mentions ----------

/**
 * Mentions are stored in comment markdown as `@[Display Name](userId)`: the composer inserts them
 * from an autocomplete, so they're unambiguous even when two people share a name.
 */
const MENTION = /@\[([^\]\n]{1,80})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export function mentionToken(name: string, userId: string): string {
  const safe =
    name
      .replace(/[[\]()\n]/g, '')
      .trim()
      .slice(0, 80) || 'someone';
  return `@[${safe}](${userId})`;
}

/** Distinct mentioned user ids, in order of first appearance. */
export function parseMentions(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(MENTION)) {
    const id = match[2]?.toLowerCase();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Replaces mention tokens with `@Name` (for previews, excerpts and plain text). */
export function stripMentions(body: string): string {
  return body.replace(MENTION, (_match, name: string) => `@${name}`);
}

/** Rewrites mention tokens as `[@Name](mention:userId)` links, which the markdown renderer shows as chips. */
export function mentionsToLinks(body: string): string {
  return body.replace(
    MENTION,
    (_match, name: string, id: string) => `[@${name}](mention:${id.toLowerCase()})`,
  );
}

// ---------- notifications ----------

export const NOTIFICATION_TYPES = ['ASSIGNED', 'MENTIONED'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notificationSchema = z.object({
  id: idSchema,
  type: z.enum(NOTIFICATION_TYPES),
  actor: userSummarySchema.nullable(),
  workspaceId: idSchema,
  boardId: idSchema.nullable(),
  cardId: idSchema.nullable(),
  commentId: idSchema.nullable(),
  cardTitle: z.string(),
  boardName: z.string(),
  /** Comment text around the mention (mentions shown as @Name). */
  excerpt: z.string().nullable(),
  readAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: idSchema.nullable(),
});

export const unreadCountSchema = z.object({ count: z.number().int().min(0) });

export const notificationQuerySchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.stringbool().default(false),
});

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

/** "Ada assigned you to 'Login page'" / "Ada mentioned you in 'Login page'". */
export function describeNotification(notification: Notification): string {
  const who = notification.actor?.name ?? 'Someone';
  return notification.type === 'ASSIGNED'
    ? `${who} assigned you to '${notification.cardTitle}'`
    : `${who} mentioned you in '${notification.cardTitle}'`;
}
