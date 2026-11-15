import type { Role } from '@teamboard/shared';
import { as, createActor, seedWorld, type World } from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';

describe('members & ownership (integration)', () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    w = await seedWorld(t);
  });

  const roleOf = async (userId: string): Promise<Role | undefined> =>
    (
      await t.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: w.workspaceId, userId } },
      })
    )?.role;

  const members = () => `/workspaces/${w.workspaceId}/members`;

  /** Adds a fresh member with `role` so each rank-rule case acts on its own target. */
  async function addMember(role: Role) {
    const user = await createActor(t, `extra-${role}`);
    await t.prisma.membership.create({ data: { workspaceId: w.workspaceId, userId: user.id, role } });
    return user;
  }

  describe('changing roles', () => {
    // [actor, target role, new role, expected status]
    const cases: ['owner' | 'admin', Role, Role, number][] = [
      ['owner', 'ADMIN', 'MEMBER', 200],
      ['owner', 'MEMBER', 'ADMIN', 200],
      ['owner', 'VIEWER', 'MEMBER', 200],
      ['owner', 'MEMBER', 'OWNER', 400], // OWNER isn't an assignable role: rejected by validation
      ['admin', 'MEMBER', 'ADMIN', 200],
      ['admin', 'VIEWER', 'MEMBER', 200],
      ['admin', 'MEMBER', 'VIEWER', 200],
      ['admin', 'ADMIN', 'MEMBER', 403],
    ];

    it.each(cases)('%s changes a %s to %s → %i', async (actor, from, to, status) => {
      const target = await addMember(from);
      await as(t, w.users[actor]).patch(`${members()}/${target.id}`, { role: to }).expect(status);
      expect(await roleOf(target.id)).toBe(status === 200 ? to : from);
    });

    it('nobody can change the owner, not even the owner', async () => {
      const byAdmin = await as(t, w.users.admin)
        .patch(`${members()}/${w.users.owner.id}`, { role: 'ADMIN' })
        .expect(403);
      expect(byAdmin.body.code).toBe('owner_protected');
      await as(t, w.users.owner).patch(`${members()}/${w.users.owner.id}`, { role: 'ADMIN' }).expect(403);
      expect(await roleOf(w.users.owner.id)).toBe('OWNER');
    });

    it('records the change in the activity log', async () => {
      await as(t, w.users.owner).patch(`${members()}/${w.users.target.id}`, { role: 'ADMIN' }).expect(200);
      const entry = await t.prisma.activity.findFirst({ where: { action: 'member.role_changed' } });
      expect(entry).toMatchObject({
        actorId: w.users.owner.id,
        entityId: w.users.target.id,
        data: { from: 'MEMBER', to: 'ADMIN' },
      });
    });

    it('404s for someone who is not a member', async () => {
      await as(t, w.users.owner).patch(`${members()}/${w.users.outsider.id}`, { role: 'ADMIN' }).expect(404);
    });
  });

  describe('removing members', () => {
    it.each<['owner' | 'admin', Role, number]>([
      ['owner', 'ADMIN', 204],
      ['owner', 'MEMBER', 204],
      ['owner', 'VIEWER', 204],
      ['admin', 'MEMBER', 204],
      ['admin', 'VIEWER', 204],
      ['admin', 'ADMIN', 403],
    ])('%s removes a %s → %i', async (actor, role, status) => {
      const target = await addMember(role);
      await as(t, w.users[actor]).delete(`${members()}/${target.id}`).expect(status);
      expect(await roleOf(target.id)).toBe(status === 204 ? undefined : role);
    });

    it('cannot remove the owner', async () => {
      const res = await as(t, w.users.admin).delete(`${members()}/${w.users.owner.id}`).expect(403);
      expect(res.body.code).toBe('owner_protected');
    });

    it("unassigns the removed member from every card and bumps those cards' version", async () => {
      const before = await t.prisma.card.findUniqueOrThrow({ where: { id: w.cardIds[0] } });
      expect(before.assigneeIds).toEqual([w.users.target.id]);
      await as(t, w.users.owner).delete(`${members()}/${w.users.target.id}`).expect(204);
      const after = await t.prisma.card.findUniqueOrThrow({ where: { id: w.cardIds[0] } });
      expect(after.assigneeIds).toEqual([]);
      expect(after.version).toBe(before.version + 1);
    });

    it('a removed member immediately loses access', async () => {
      await as(t, w.users.owner).delete(`${members()}/${w.users.member.id}`).expect(204);
      await as(t, w.users.member).get(`/boards/${w.boardId}`).expect(404);
    });
  });

  describe('leaving', () => {
    it('members, admins and viewers can leave', async () => {
      for (const actor of ['admin', 'member', 'viewer'] as const) {
        await as(t, w.users[actor]).post(`/workspaces/${w.workspaceId}/leave`).expect(204);
        expect(await roleOf(w.users[actor].id)).toBeUndefined();
      }
    });

    it('the owner must transfer ownership first', async () => {
      const res = await as(t, w.users.owner).post(`/workspaces/${w.workspaceId}/leave`).expect(403);
      expect(res.body.code).toBe('owner_protected');
    });
  });

  describe('transferring ownership', () => {
    it('swaps owner and target, leaving exactly one owner', async () => {
      await as(t, w.users.owner)
        .post(`/workspaces/${w.workspaceId}/transfer-ownership`, { userId: w.users.member.id })
        .expect(204);
      expect(await roleOf(w.users.member.id)).toBe('OWNER');
      expect(await roleOf(w.users.owner.id)).toBe('ADMIN');
      expect(await t.prisma.membership.count({ where: { workspaceId: w.workspaceId, role: 'OWNER' } })).toBe(
        1,
      );

      // The old owner is now an admin and can't delete the workspace any more; the new one can leave only after transferring.
      await as(t, w.users.owner).delete(`/workspaces/${w.workspaceId}`).expect(403);
      await as(t, w.users.owner).post(`/workspaces/${w.workspaceId}/leave`).expect(204);
    });

    it('rejects a transfer to yourself or to a non-member', async () => {
      const self = await as(t, w.users.owner)
        .post(`/workspaces/${w.workspaceId}/transfer-ownership`, { userId: w.users.owner.id })
        .expect(400);
      expect(self.body.code).toBe('role_change_not_allowed');
      await as(t, w.users.owner)
        .post(`/workspaces/${w.workspaceId}/transfer-ownership`, { userId: w.users.outsider.id })
        .expect(404);
    });

    it('two concurrent transfers never produce two owners', async () => {
      const path = `/workspaces/${w.workspaceId}/transfer-ownership`;
      const results = await Promise.all([
        as(t, w.users.owner).post(path, { userId: w.users.admin.id }),
        as(t, w.users.owner).post(path, { userId: w.users.member.id }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
      expect(await t.prisma.membership.count({ where: { workspaceId: w.workspaceId, role: 'OWNER' } })).toBe(
        1,
      );
    });
  });
});
