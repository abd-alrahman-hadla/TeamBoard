import type { OpenAPIObject } from '@nestjs/swagger';

type Operation = NonNullable<OpenAPIObject['paths'][string]['get']>;
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;

/**
 * Declares every `{name}` in a path as a required path parameter where the operation doesn't.
 * Handlers that read their workspace through `@CurrentAccess()` (resolved by WorkspaceRoleGuard
 * from the URL) have no `@Param()`, so Swagger would otherwise render `{workspaceId}` with no
 * input to fill it in.
 */
export function addMissingPathParams(document: OpenAPIObject): OpenAPIObject {
  for (const [path, item] of Object.entries(document.paths)) {
    const names = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '');
    if (names.length === 0) continue;
    for (const method of METHODS) {
      const operation: Operation | undefined = item[method];
      if (!operation) continue;
      const parameters = operation.parameters ?? [];
      const declared = new Set(
        parameters.flatMap((parameter) =>
          'in' in parameter && parameter.in === 'path' ? [parameter.name] : [],
        ),
      );
      const added = names
        .filter((name) => !declared.has(name))
        .map((name) => ({
          name,
          in: 'path' as const,
          required: true,
          schema: { type: 'string' as const, format: 'uuid' },
        }));
      if (added.length > 0) operation.parameters = [...added, ...parameters];
    }
  }
  return document;
}
