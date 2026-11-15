import { z } from 'zod';

export const idSchema = z.uuid();
export const timestampSchema = z.iso.datetime();

/** Where to place an item: after this sibling; `null` = first; omitted (on create) = last. */
export const afterIdSchema = idSchema.nullable();

/** At least one field must be present on a PATCH body. */
export function nonEmptyPatch<T extends z.ZodObject>(schema: T) {
  return schema.refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'Provide at least one field to update',
  });
}

export const userSummarySchema = z.object({ id: idSchema, name: z.string() });
export type UserSummary = z.infer<typeof userSummarySchema>;
