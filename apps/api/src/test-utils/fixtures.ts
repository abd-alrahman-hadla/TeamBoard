import { positionBetween, type Role } from '@teamboard/shared';
import { randomUUID } from 'node:crypto';
import type { Test } from 'supertest';
import { TokenService } from '../auth/token.service';
import { generateOpaqueToken, hashOpaqueToken } from '../common/opaque-token';
import type { TestApp } from './test-app';

export interface Actor {
  id: string;
  email: string;
  name: string;
  token: string;
}

export const MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type MemberLabel = (typeof MEMBER_ROLES)[number];
export type ActorLabel = MemberLabel | 'outsider';
export const ACTORS: readonly ActorLabel[] = [...MEMBER_ROLES, 'outsider'];

export const ROLE_OF: Record<MemberLabel, Role> = {
  owner: 'OWNER',
  admin: 'ADMIN',
  member: 'MEMBER',
  viewer: 'VIEWER',
};

/** One workspace with a user per role, an outsider, a spare member to act on, and some content. */
export interface World {
  workspaceId: string;
  users: Record<ActorLabel | 'target', Actor>;
  boardId: string;
  columnIds: [string, string];
  cardIds: [string, string];
  /** Written by `member`. */
  commentId: string;
  invitationId: string;
  invitationToken: string;
}

/** Inserts a user directly (no argon2, so fixtures stay fast) and mints an access token for them. */
export async function createActor(t: TestApp, label: string): Promise<Actor> {
  const suffix = randomUUID().slice(0, 8);
  const user = await t.prisma.user.create({
    data: {
      email: `${label}-${suffix}@test.dev`,
      name: `${label} ${suffix}`,
      passwordHash: 'not-a-real-hash',
    },
  });
  const token = await t.app.get(TokenService).signAccessToken(user.id);
  return { id: user.id, email: user.email, name: user.name, token };
}

export async function seedWorld(t: TestApp, label = 'w'): Promise<World> {
  const [owner, admin, member, viewer, outsider, target] = await Promise.all(
    ['owner', 'admin', 'member', 'viewer', 'outsider', 'target'].map((role) =>
      createActor(t, `${label}-${role}`),
    ),
  );
  if (!owner || !admin || !member || !viewer || !outsider || !target)
    throw new Error('fixture users missing');

  const workspace = await t.prisma.workspace.create({
    data: {
      name: `Workspace ${label}`,
      memberships: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: admin.id, role: 'ADMIN' },
          { userId: member.id, role: 'MEMBER' },
          { userId: viewer.id, role: 'VIEWER' },
          { userId: target.id, role: 'MEMBER' },
        ],
      },
    },
  });
  const board = await t.prisma.board.create({ data: { workspaceId: workspace.id, name: `Board ${label}` } });
  const p1 = positionBetween(null, null);
  const p2 = positionBetween(p1, null);
  const todo = await t.prisma.column.create({ data: { boardId: board.id, name: 'To do', position: p1 } });
  const doing = await t.prisma.column.create({ data: { boardId: board.id, name: 'Doing', position: p2 } });
  const card1 = await t.prisma.card.create({
    data: { boardId: board.id, columnId: todo.id, title: 'First', position: p1, assigneeIds: [target.id] },
  });
  const card2 = await t.prisma.card.create({
    data: { boardId: board.id, columnId: todo.id, title: 'Second', position: p2 },
  });
  const comment = await t.prisma.comment.create({
    data: { cardId: card1.id, authorId: member.id, body: 'Hello' },
  });
  const invitationToken = generateOpaqueToken();
  const invitation = await t.prisma.invitation.create({
    data: {
      workspaceId: workspace.id,
      email: `invitee-${randomUUID().slice(0, 8)}@test.dev`,
      role: 'MEMBER',
      tokenHash: hashOpaqueToken(invitationToken),
      invitedById: owner.id,
      expiresAt: new Date(Date.now() + 48 * 3600_000),
    },
  });

  return {
    workspaceId: workspace.id,
    users: { owner, admin, member, viewer, outsider, target },
    boardId: board.id,
    columnIds: [todo.id, doing.id],
    cardIds: [card1.id, card2.id],
    commentId: comment.id,
    invitationId: invitation.id,
    invitationToken,
  };
}

type Method = 'get' | 'post' | 'patch' | 'delete';

/** supertest with the actor's bearer token (or none). */
export function call(t: TestApp, actor: Actor | null, method: Method, path: string, body?: object): Test {
  const request = t.http()[method](path);
  if (actor) request.set('Authorization', `Bearer ${actor.token}`);
  return body === undefined ? request : request.send(body);
}

export function as(t: TestApp, actor: Actor) {
  return {
    get: (path: string) => call(t, actor, 'get', path),
    post: (path: string, body?: object) => call(t, actor, 'post', path, body ?? {}),
    patch: (path: string, body: object) => call(t, actor, 'patch', path, body),
    delete: (path: string) => call(t, actor, 'delete', path),
  };
}
