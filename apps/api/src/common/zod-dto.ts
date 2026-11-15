import type { z } from 'zod';

export interface ZodDtoClass<TSchema extends z.ZodType> {
  new (): z.output<TSchema>;
  readonly schema: TSchema;
}

/**
 * Turns a shared Zod schema into a class Nest can see through decorator metadata:
 * `class RegisterDto extends createZodDto(registerInputSchema) {}`.
 * The global ZodValidationPipe reads the static `schema` and parses the request with it.
 */
export function createZodDto<TSchema extends z.ZodType>(schema: TSchema): ZodDtoClass<TSchema> {
  class ZodDto {
    static readonly schema = schema;
  }
  return ZodDto as ZodDtoClass<TSchema>;
}

function isZodSchema(value: unknown): value is z.ZodType {
  return (
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof value.safeParse === 'function'
  );
}

export function getZodSchema(metatype: unknown): z.ZodType | undefined {
  if (typeof metatype !== 'function' || !('schema' in metatype)) return undefined;
  return isZodSchema(metatype.schema) ? metatype.schema : undefined;
}
