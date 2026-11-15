import {
  createdInvitationSchema,
  invitationPreviewSchema,
  invitationSchema,
  myWorkspaceSchema,
} from '@teamboard/shared';
import { z } from 'zod';
import { generateOpaqueToken } from '../common/opaque-token';
import { Mailer } from '../mail/mailer';
import { as, type Actor, call, createActor, seedWorld, type World } from '../test-utils/fixtures';
import { createTestApp, resetDb, type TestApp } from '../test-utils/test-app';
import { TEST_WEB_ORIGIN } from '../test-utils/test-env';

const HOUR = 3600_000;

describe('invitations (integration)', () => {
  let t: TestApp;
  let w: World;
  let sendInvitation: jest.SpyInstance;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    w = await seedWorld(t);
    sendInvitation = jest.spyOn(t.app.get(Mailer), 'sendInvitation');
  });

  afterEach(() => {
    sendInvitation.mockRestore();
  });

  const invitationsPath = () => `/workspaces/${w.workspaceId}/invitations`;

  async function invite(email: string, role = 'MEMBER', by: Actor = w.users.admin) {
    const res = await as(t, by).post(invitationsPath(), { email, role }).expect(201);
    const created = createdInvitationSchema.parse(res.body);
    const token = created.link.split('/invite/')[1] ?? '';
    return { ...created, token };
  }

  it('returns a token link valid for 48 hours, stores only its hash, and hands it to the mailer', async () => {
    const invitee = await createActor(t, 'invitee');
    const startedAt = Date.now();
    const created = await invite(invitee.email.toUpperCase(), 'ADMIN');

    expect(created.link).toMatch(new RegExp(`^${TEST_WEB_ORIGIN}/invite/[A-Za-z0-9_-]{43}$`));
    expect(created.invitation).toMatchObject({
      email: invitee.email,
      role: 'ADMIN',
      invitedBy: { id: w.users.admin.id },
    });
    const expiresIn = new Date(created.invitation.expiresAt).getTime() - startedAt;
    expect(expiresIn).toBeGreaterThan(48 * HOUR - 60_000);
    expect(expiresIn).toBeLessThanOrEqual(48 * HOUR + 60_000);

    const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id: created.invitation.id } });
    expect(row.tokenHash).not.toContain(created.token);
    expect(sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ to: invitee.email, link: created.link, workspaceName: 'Workspace w' }),
    );
  });

  it('lets the invitee preview and accept, joining with the invited role', async () => {
    const invitee = await createActor(t, 'invitee');
    const { token } = await invite(invitee.email, 'VIEWER');

    const preview = await t.http().get(`/invitations/${token}`).expect(200);
    expect(invitationPreviewSchema.parse(preview.body)).toMatchObject({
      workspace: { id: w.workspaceId },
      role: 'VIEWER',
      invitedBy: w.users.admin.name,
    });
    expect(preview.body.email).not.toBe(invitee.email);

    const accepted = await as(t, invitee).post(`/invitations/${token}/accept`).expect(200);
    expect(myWorkspaceSchema.parse(accepted.body)).toMatchObject({ id: w.workspaceId, role: 'VIEWER' });
    await as(t, invitee).get(`/boards/${w.boardId}`).expect(200);

    // Single use.
    const again = await as(t, invitee).post(`/invitations/${token}/accept`).expect(404);
    expect(again.body.code).toBe('invitation_invalid');
    await t.http().get(`/invitations/${token}`).expect(404);
  });

  it('rejects an expired invitation with 410', async () => {
    const invitee = await createActor(t, 'invitee');
    const { token, invitation } = await invite(invitee.email);
    await t.prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await t.http().get(`/invitations/${token}`).expect(410)).body.code).toBe('invitation_expired');
    expect((await as(t, invitee).post(`/invitations/${token}/accept`).expect(410)).body.code).toBe(
      'invitation_expired',
    );
    expect(await t.prisma.membership.count({ where: { userId: invitee.id } })).toBe(0);
  });

  it('only the invited email can accept', async () => {
    const invitee = await createActor(t, 'invitee');
    const { token } = await invite(invitee.email);
    const res = await as(t, w.users.outsider).post(`/invitations/${token}/accept`).expect(403);
    expect(res.body.code).toBe('invitation_email_mismatch');
    // The link still works for the right person.
    await as(t, invitee).post(`/invitations/${token}/accept`).expect(200);
  });

  it('a revoked invitation cannot be used', async () => {
    const invitee = await createActor(t, 'invitee');
    const { token, invitation } = await invite(invitee.email);
    await as(t, w.users.admin).delete(`${invitationsPath()}/${invitation.id}`).expect(204);
    await as(t, invitee).post(`/invitations/${token}/accept`).expect(404);
    await as(t, w.users.admin).delete(`${invitationsPath()}/${invitation.id}`).expect(404);
  });

  it('re-inviting the same email replaces the earlier link', async () => {
    const invitee = await createActor(t, 'invitee');
    const first = await invite(invitee.email);
    const second = await invite(invitee.email, 'ADMIN');
    await as(t, invitee).post(`/invitations/${first.token}/accept`).expect(404);
    const res = await as(t, invitee).post(`/invitations/${second.token}/accept`).expect(200);
    expect(res.body.role).toBe('ADMIN');

    const pending = await as(t, w.users.admin).get(invitationsPath()).expect(200);
    expect(
      z
        .array(invitationSchema)
        .parse(pending.body)
        .map((i) => i.email),
    ).not.toContain(invitee.email);
  });

  it('rejects inviting an existing member, and accepting when already a member', async () => {
    const dup = await as(t, w.users.admin)
      .post(invitationsPath(), { email: w.users.member.email, role: 'ADMIN' })
      .expect(409);
    expect(dup.body.code).toBe('already_member');

    const invitee = await createActor(t, 'invitee');
    const { token } = await invite(invitee.email);
    await t.prisma.membership.create({
      data: { workspaceId: w.workspaceId, userId: invitee.id, role: 'VIEWER' },
    });
    expect((await as(t, invitee).post(`/invitations/${token}/accept`).expect(409)).body.code).toBe(
      'already_member',
    );
  });

  it('nobody can invite as OWNER (rejected by validation)', async () => {
    await as(t, w.users.owner).post(invitationsPath(), { email: 'boss@test.dev', role: 'OWNER' }).expect(400);
  });

  it('two concurrent accepts of the same link: exactly one membership', async () => {
    const invitee = await createActor(t, 'invitee');
    const { token } = await invite(invitee.email);
    const results = await Promise.all([
      as(t, invitee).post(`/invitations/${token}/accept`),
      as(t, invitee).post(`/invitations/${token}/accept`),
    ]);
    expect(results.map((r) => r.status)).toContain(200);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await t.prisma.membership.count({ where: { userId: invitee.id } })).toBe(1);
  });

  it('unknown and malformed tokens are invalid; accepting needs sign-in', async () => {
    await t.http().get(`/invitations/${generateOpaqueToken()}`).expect(404);
    await t.http().get('/invitations/short').expect(404);
    await call(t, null, 'post', `/invitations/${w.invitationToken}/accept`).expect(401);
  });

  it('activity never exposes the invitee email to viewers', async () => {
    const invitee = await createActor(t, 'invitee');
    await invite(invitee.email);
    const res = await as(t, w.users.viewer).get(`/workspaces/${w.workspaceId}/activity`).expect(200);
    expect(JSON.stringify(res.body)).not.toContain(invitee.email);
  });
});
