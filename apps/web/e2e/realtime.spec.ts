import { type Browser, expect, type Page, request, test } from '@playwright/test';
import {
  type Actor,
  cardTitles,
  column,
  card,
  dragTo,
  openBoardAs,
  setupBoard,
  type BoardWorld,
} from './board-setup';
import { E2E } from './e2e-env';

/** A page in its own browser context (separate cookies = a different person or device). */
async function pageFor(browser: Browser, world: BoardWorld, actor: Actor): Promise<Page> {
  const context = await browser.newContext({ baseURL: E2E.webUrl });
  const page = await context.newPage();
  await openBoardAs(page, world, actor);
  // Live once our own avatar is shown.
  await expect(page.getByTestId('presence-avatar').first()).toBeVisible();
  return page;
}

/** REST call made outside any browser (another device, a script…). */
async function apiAs(actor: Actor, method: 'post' | 'patch' | 'delete', path: string, data?: object) {
  const ctx = await request.newContext({ baseURL: E2E.apiUrl });
  const res = await ctx[method](path, {
    headers: { Authorization: `Bearer ${actor.token}` },
    ...(data ? { data } : {}),
  });
  expect(res.ok(), `${method} ${path} → ${res.status()}`).toBe(true);
  await ctx.dispose();
}

test.describe('realtime collaboration', () => {
  test('a change in one browser shows up in the other without reloading', async ({ browser }) => {
    const world = await setupBoard();
    const owner = await pageFor(browser, world, world.owner);
    const member = await pageFor(browser, world, world.member);

    // Drag in the owner's browser…
    await dragTo(owner, card(owner, 'Beta'), column(owner, 'Done'));
    // …and the member sees it move.
    await expect.poll(() => cardTitles(member, 'Done')).toEqual(['Beta']);
    await expect.poll(() => cardTitles(member, 'To do')).toEqual(['Alpha', 'Gamma']);

    // Edits made elsewhere (here: straight through the API) reach both browsers.
    await apiAs(world.member, 'patch', `/cards/${world.cards.gamma}`, {
      title: 'Gamma (renamed)',
      labels: ['live'],
    });
    await expect(card(owner, 'Gamma (renamed)')).toContainText('live');
    await expect(card(member, 'Gamma (renamed)')).toContainText('live');

    // New columns appear too.
    await apiAs(world.owner, 'post', `/boards/${world.boardId}/columns`, { name: 'Review' });
    await expect(column(member, 'Review')).toBeVisible();
  });

  test('shows who is viewing and who is editing a card', async ({ browser }) => {
    const world = await setupBoard();
    const owner = await pageFor(browser, world, world.owner);
    const member = await pageFor(browser, world, world.member);

    await expect(owner.getByTestId('presence-avatar')).toHaveCount(2);
    await expect(member.getByTestId('presence-avatar')).toHaveCount(2);
    await expect(member.getByRole('status').filter({ hasText: 'Viewing now' })).toContainText('You');

    await card(owner, 'Alpha').click();
    await expect(owner.getByRole('dialog')).toBeVisible();
    const ownerFirst = world.owner.name.split(' ')[0] ?? '';
    await expect(card(member, 'Alpha').getByTestId('card-editing')).toHaveText(`${ownerFirst} is editing`);

    await card(member, 'Alpha').click();
    await expect(member.getByTestId('dialog-editing')).toContainText(`${ownerFirst} is editing this card`);

    await owner.keyboard.press('Escape');
    await expect(member.getByTestId('dialog-editing')).toBeHidden();

    // Closing the member's tab removes them from the owner's presence.
    await member.context().close();
    await expect(owner.getByTestId('presence-avatar')).toHaveCount(1);
  });

  test('after a dropped connection, the board catches up on what it missed', async ({ browser }) => {
    const world = await setupBoard();
    const member = await pageFor(browser, world, world.member);

    await member.evaluate(() =>
      (window as unknown as { __teamboardSocket: { disconnect(): void } }).__teamboardSocket.disconnect(),
    );
    await expect(member.getByTestId('realtime-status')).toHaveText('Reconnecting…');

    // Changes happen while this browser is offline.
    await apiAs(world.owner, 'post', `/cards/${world.cards.gamma}/move`, {
      columnId: world.columns.doing,
      afterId: null,
    });
    await apiAs(world.owner, 'delete', `/cards/${world.cards.beta}`);
    await member.waitForTimeout(500);
    await expect.poll(() => cardTitles(member, 'To do')).toEqual(['Alpha', 'Beta', 'Gamma']);

    await member.evaluate(() =>
      (window as unknown as { __teamboardSocket: { connect(): void } }).__teamboardSocket.connect(),
    );
    await expect(member.getByTestId('presence-avatar').first()).toBeVisible();
    await expect.poll(() => cardTitles(member, 'To do')).toEqual(['Alpha']);
    await expect.poll(() => cardTitles(member, 'Doing')).toEqual(['Gamma', 'Delta']);
  });

  test('a removed member loses the live board at once', async ({ browser }) => {
    const world = await setupBoard();
    const member = await pageFor(browser, world, world.member);

    await apiAs(
      world.owner,
      'delete',
      `/workspaces/${await workspaceIdOf(world)}/members/${world.member.id}`,
    );

    await expect(
      member.getByRole('heading', { name: 'You no longer have access to this board' }),
    ).toBeVisible();
  });

  test('viewers get live updates too', async ({ browser }) => {
    const world = await setupBoard();
    const viewer = await pageFor(browser, world, world.viewer);
    await apiAs(world.member, 'post', `/columns/${world.columns.done}/cards`, { title: 'Fresh card' });
    await expect.poll(() => cardTitles(viewer, 'Done')).toEqual(['Fresh card']);
  });
});

async function workspaceIdOf(world: BoardWorld): Promise<string> {
  const ctx = await request.newContext({ baseURL: E2E.apiUrl });
  const res = await ctx.get(`/boards/${world.boardId}`, {
    headers: { Authorization: `Bearer ${world.owner.token}` },
  });
  const body = (await res.json()) as { workspaceId: string };
  await ctx.dispose();
  return body.workspaceId;
}
