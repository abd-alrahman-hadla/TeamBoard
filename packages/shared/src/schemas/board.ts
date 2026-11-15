import { z } from 'zod';
import { afterIdSchema, idSchema, nonEmptyPatch, timestampSchema, userSummarySchema } from './common';

const nameSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(max, { error: `Name must be at most ${max} characters` });

// ---------- boards ----------

export const createBoardInputSchema = z.object({
  name: nameSchema(100),
  description: z.string().trim().max(2000).nullable().optional(),
});
export const updateBoardInputSchema = nonEmptyPatch(
  z.object({
    name: nameSchema(100).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  }),
);

export const boardSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  version: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

// ---------- columns ----------

export const createColumnInputSchema = z.object({
  name: nameSchema(100),
  afterId: afterIdSchema.optional(),
});
export const updateColumnInputSchema = z.object({ name: nameSchema(100) });
export const moveColumnInputSchema = z.object({ afterId: afterIdSchema });

export const columnSchema = z.object({
  id: idSchema,
  boardId: idSchema,
  name: z.string(),
  position: z.string(),
  version: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

// ---------- cards ----------

export const MAX_LABELS = 10;
export const MAX_ASSIGNEES = 20;

const unique = <T>(items: readonly T[]) => new Set(items).size === items.length;

export const labelsSchema = z
  .array(z.string().trim().min(1).max(32))
  .max(MAX_LABELS, { error: `At most ${MAX_LABELS} labels` })
  .refine(unique, { error: 'Labels must be unique' });

export const assigneeIdsSchema = z
  .array(idSchema)
  .max(MAX_ASSIGNEES, { error: `At most ${MAX_ASSIGNEES} assignees` })
  .refine(unique, { error: 'Assignees must be unique' });

const cardTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required' })
  .max(200, { error: 'Title must be at most 200 characters' });
/** Markdown source; rendering and sanitising happen in the web app. */
const cardDescriptionSchema = z.string().max(20_000).nullable();
const dueDateSchema = z.iso.datetime({ offset: true }).nullable();

export const createCardInputSchema = z.object({
  title: cardTitleSchema,
  description: cardDescriptionSchema.optional(),
  labels: labelsSchema.optional(),
  dueDate: dueDateSchema.optional(),
  assigneeIds: assigneeIdsSchema.optional(),
  afterId: afterIdSchema.optional(),
});

export const updateCardInputSchema = nonEmptyPatch(
  z.object({
    title: cardTitleSchema.optional(),
    description: cardDescriptionSchema.optional(),
    labels: labelsSchema.optional(),
    dueDate: dueDateSchema.optional(),
    assigneeIds: assigneeIdsSchema.optional(),
  }),
);

/** Moves stay within the card's board; `columnId` may be the current column. */
export const moveCardInputSchema = z.object({ columnId: idSchema, afterId: afterIdSchema });

export const cardSchema = z.object({
  id: idSchema,
  boardId: idSchema,
  columnId: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  labels: z.array(z.string()),
  dueDate: timestampSchema.nullable(),
  assigneeIds: z.array(idSchema),
  position: z.string(),
  version: z.number().int(),
  createdById: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** Everything the board page needs in one request, already ordered. */
export const boardDetailSchema = boardSchema.extend({
  columns: z.array(columnSchema.extend({ cards: z.array(cardSchema) })),
});

// ---------- comments ----------

const commentBodySchema = z
  .string()
  .trim()
  .min(1, { error: 'Comment cannot be empty' })
  .max(5000, { error: 'Comment must be at most 5000 characters' });

export const createCommentInputSchema = z.object({ body: commentBodySchema });
export const updateCommentInputSchema = z.object({ body: commentBodySchema });

export const commentSchema = z.object({
  id: idSchema,
  cardId: idSchema,
  author: userSummarySchema.nullable(),
  body: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

// ---------- activity ----------

export const activityQuerySchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const activitySchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  boardId: idSchema.nullable(),
  actor: userSummarySchema.nullable(),
  entityType: z.string(),
  entityId: idSchema,
  action: z.string(),
  data: z.record(z.string(), z.unknown()),
  createdAt: timestampSchema,
});

export const activityPageSchema = z.object({
  items: z.array(activitySchema),
  nextCursor: idSchema.nullable(),
});

export type CreateBoardInput = z.infer<typeof createBoardInputSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardInputSchema>;
export type Board = z.infer<typeof boardSchema>;
export type BoardDetail = z.infer<typeof boardDetailSchema>;
export type CreateColumnInput = z.infer<typeof createColumnInputSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnInputSchema>;
export type MoveColumnInput = z.infer<typeof moveColumnInputSchema>;
export type Column = z.infer<typeof columnSchema>;
export type CreateCardInput = z.infer<typeof createCardInputSchema>;
export type UpdateCardInput = z.infer<typeof updateCardInputSchema>;
export type MoveCardInput = z.infer<typeof moveCardInputSchema>;
export type Card = z.infer<typeof cardSchema>;
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type Activity = z.infer<typeof activitySchema>;
export type ActivityPage = z.infer<typeof activityPageSchema>;
