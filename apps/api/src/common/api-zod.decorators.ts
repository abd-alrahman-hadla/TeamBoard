import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiResponse } from '@nestjs/swagger';
import { apiErrorSchema } from '@teamboard/shared';
import { z } from 'zod';

/** @nestjs/swagger doesn't export SchemaObject from its entry point, so derive it from ApiBody. */
type SchemaObject = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

/** Converts a Zod schema to an OpenAPI 3.0 schema object with Zod 4's built-in converter. */
export function toOpenApiSchema(schema: z.ZodType, io: 'input' | 'output'): SchemaObject {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  });
  // JSON Schema and Swagger's SchemaObject describe the same document; the types differ only nominally.
  return jsonSchema as SchemaObject;
}

export function ApiZodBody(schema: z.ZodType): MethodDecorator & ClassDecorator {
  return applyDecorators(ApiBody({ schema: toOpenApiSchema(schema, 'input') }));
}

export function ApiZodResponse(
  status: number,
  schema: z.ZodType,
  description?: string,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({
      status,
      schema: toOpenApiSchema(schema, 'output'),
      ...(description ? { description } : {}),
    }),
  );
}

export function ApiErrorResponse(status: number, description: string): MethodDecorator & ClassDecorator {
  return ApiZodResponse(status, apiErrorSchema, description);
}
