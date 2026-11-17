import type { OpenAPIObject } from '@nestjs/swagger';
import { addMissingPathParams } from './swagger-path-params';

const doc = (paths: OpenAPIObject['paths']): OpenAPIObject => ({
  openapi: '3.0.0',
  info: { title: 't', version: '1' },
  paths,
});

describe('addMissingPathParams', () => {
  it('declares path params the handler never read with @Param()', () => {
    const result = addMissingPathParams(
      doc({ '/workspaces/{workspaceId}/members': { get: { responses: {} } } }),
    );
    expect(result.paths['/workspaces/{workspaceId}/members']?.get?.parameters).toEqual([
      { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ]);
  });

  it('keeps declared params and adds only the missing ones', () => {
    const userId = {
      name: 'userId',
      in: 'path' as const,
      required: true,
      schema: { type: 'string' as const },
    };
    const query = { name: 'cursor', in: 'query' as const, schema: { type: 'string' as const } };
    const result = addMissingPathParams(
      doc({
        '/workspaces/{workspaceId}/members/{userId}': {
          delete: { parameters: [userId, query], responses: {} },
        },
      }),
    );
    const names = result.paths['/workspaces/{workspaceId}/members/{userId}']?.delete?.parameters?.map((p) =>
      'name' in p ? p.name : '',
    );
    expect(names).toEqual(['workspaceId', 'userId', 'cursor']);
  });

  it('leaves paths without params alone', () => {
    const result = addMissingPathParams(doc({ '/auth/login': { post: { responses: {} } } }));
    expect(result.paths['/auth/login']?.post?.parameters).toBeUndefined();
  });
});
