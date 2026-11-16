import { type APIRequestContext, expect, type Locator, type Page, request } from '@playwright/test';
import { E2E } from './e2e-env';
import { loginViaUi, newUser, type TestUser } from './fixtures';

export interface Actor extends TestUser {
  id: string;
  token: string;
}

export interface BoardWorld {
  workspaceName: string;
  boardId: string;
  boardName: string;
  owner: Actor;
  member: Actor;
  viewer: Actor;
  columns: Record<'todo' | 'doing' | 'done', string>;
  cards: Record<'alpha' | 'beta' | 'gamma' | 'delta', string>;
}

async function api(
  ctx: APIRequestContext,
  token: string,
  method: 'get' | 'post' | 'patch',
  path: string,
  data?: object,
) {
  const res = await ctx[method](path, {
    headers: { Authorization: `Bearer ${token}` },
    ...(data ? { data } : {}),
  });
  expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

async function register(ctx: APIRequestContext, label: string): Promise<Actor> {
  const user = newUser();
  user.name = `${label} ${user.name.split(' ')[1] ?? ''}`.trim();
  const res = await ctx.post('/auth/register', { data: user });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { ...user, id: body.user.id, token: body.accessToken };
}

/** End of a local day `offset` days from today, as the web app stores due dates. */
export function dueInDays(offset: number): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 23, 59, 59, 999).toISOString();
}

/**
 * Fresh workspace per test: owner + member + viewer (joined through real invitations),
 * a board with To do / Doing / Done and four cards with labels, assignees and due dates.
 */
export async function setupBoard(): Promise<BoardWorld> {
  const ctx = await request.newContext({ baseURL: E2E.apiUrl });
  try {
    const owner = await register(ctx, 'Owner');
    const member = await register(ctx, 'Member');
    const viewer = await register(ctx, 'Viewer');

    const workspaceName = `Team ${owner.email.slice(5, 13)}`;
    const ws = await api(ctx, owner.token, 'post', '/workspaces', { name: workspaceName });
    for (const [user, role] of [
      [member, 'MEMBER'],
      [viewer, 'VIEWER'],
    ] as const) {
      const invite = await api(ctx, owner.token, 'post', `/workspaces/${ws['id'] as string}/invitations`, {
        email: user.email,
        role,
      });
      const token = String(invite['link']).split('/invite/')[1] ?? '';
      await api(ctx, user.token, 'post', `/invitations/${token}/accept`);
    }

    const boardName = 'Launch plan';
    const board = await api(ctx, owner.token, 'post', `/workspaces/${ws['id'] as string}/boards`, {
      name: boardName,
    });
    const boardId = board['id'] as string;
    const column = async (name: string) =>
      (await api(ctx, owner.token, 'post', `/boards/${boardId}/columns`, { name }))['id'] as string;
    const columns = { todo: await column('To do'), doing: await column('Doing'), done: await column('Done') };

    const card = async (columnId: string, data: object) =>
      (await api(ctx, owner.token, 'post', `/columns/${columnId}/cards`, data))['id'] as string;
    const cards = {
      alpha: await card(columns.todo, {
        title: 'Alpha',
        labels: ['bug'],
        assigneeIds: [member.id],
        dueDate: dueInDays(-1),
      }),
      beta: await card(columns.todo, { title: 'Beta', labels: ['docs'] }),
      gamma: await card(columns.todo, { title: 'Gamma', dueDate: dueInDays(1) }),
      delta: await card(columns.doing, { title: 'Delta' }),
    };
    return { workspaceName, boardId, boardName, owner, member, viewer, columns, cards };
  } finally {
    await ctx.dispose();
  }
}

export async function openBoardAs(page: Page, world: BoardWorld, user: TestUser): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(`/b/${world.boardId}`)}`);
  await loginViaUi(page, user);
  await expect(page).toHaveURL(new RegExp(`/b/${world.boardId}`));
  await expect(page.getByTestId('card').first()).toBeVisible();
}

export const column = (page: Page, name: string): Locator => page.locator(`section[aria-label="${name}"]`);
export const card = (page: Page, title: string): Locator =>
  page.getByTestId('card').and(page.getByLabel(title, { exact: true }));

/**
 * Keyboard pick-up: focus, Space, then wait until the drag is live. dnd-kit attaches its arrow-key
 * listener in a setTimeout after activation, so an arrow pressed in the same instant (only a
 * script is that fast) would be dropped.
 */
export async function pickUp(page: Page, handle: Locator, announcement: string): Promise<void> {
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(liveRegion(page)).toContainText(announcement);
  await page.waitForTimeout(150);
}

/** dnd-kit's screen-reader live region (holds the latest announcement). */
export const liveRegion = (page: Page): Locator => page.locator('[id^="DndLiveRegion"]').first();

export async function cardTitles(page: Page, columnName: string): Promise<string[]> {
  return column(page, columnName)
    .getByTestId('card')
    .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label') ?? ''));
}

export async function columnNames(page: Page): Promise<string[]> {
  return page
    .getByTestId('column')
    .evaluateAll((cols) => cols.map((c) => c.getAttribute('aria-label') ?? ''));
}

/** Pointer drag with intermediate moves so dnd-kit's activation distance and collision detection kick in. */
export async function dragTo(page: Page, source: Locator, target: Locator, offsetY = 0.5): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target is not visible');
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 4, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * offsetY, { steps: 25 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * offsetY + 2, { steps: 2 });
  await page.mouse.up();
}
