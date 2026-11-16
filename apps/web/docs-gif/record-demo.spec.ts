/**
 * Records docs/live-demo.gif: Sara (left) and Omar (right) on the same board in two browsers.
 *   pnpm docs:gif     (needs `docker compose up -d`; reuses the e2e servers and database)
 * Not part of the e2e suite: it's matched only by playwright.docs.config.ts.
 */
import { type APIRequestContext, type Browser, expect, type Page, request, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { card, column, dragTo } from '../e2e/board-setup';
import { E2E } from '../e2e/e2e-env';
import { loginViaUi, PASSWORD } from '../e2e/fixtures';
import { GifRecorder, sideBySide } from './gif-frames';

const OUTPUT = join(__dirname, '..', '..', '..', 'docs', 'live-demo.gif');
// A roomy layout rendered at 0.72x: each side is ~650×420 px in the GIF, but shows the whole board.
const VIEWPORT = { width: 900, height: 580 };
const SCALE = 0.72;
const MAX_BYTES = 3.5 * 1024 * 1024;

interface Person {
  name: string;
  email: string;
  password: string;
  id: string;
  token: string;
}

async function call(
  ctx: APIRequestContext,
  token: string,
  method: 'post' | 'patch',
  path: string,
  data?: object,
) {
  const res = await ctx[method](path, {
    headers: { Authorization: `Bearer ${token}` },
    ...(data ? { data } : {}),
  });
  expect(res.ok(), `${method} ${path} → ${res.status()}`).toBe(true);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
}

async function register(ctx: APIRequestContext, name: string): Promise<Person> {
  const email = `${name.split(' ')[0]?.toLowerCase() ?? 'user'}+${randomUUID().slice(0, 8)}@demo.test`;
  const res = await ctx.post('/auth/register', { data: { name, email, password: PASSWORD } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { name, email, password: PASSWORD, id: body.user.id, token: body.accessToken };
}

/** A small workspace: Sara and Omar as members of "Website launch". */
async function seed(): Promise<{ boardId: string; sara: Person; omar: Person }> {
  const ctx = await request.newContext({ baseURL: E2E.apiUrl });
  try {
    const owner = await register(ctx, 'Team Lead');
    const sara = await register(ctx, 'Sara Haddad');
    const omar = await register(ctx, 'Omar Nasser');
    const ws = await call(ctx, owner.token, 'post', '/workspaces', { name: 'Acme web team' });
    for (const person of [sara, omar]) {
      const invite = await call(ctx, owner.token, 'post', `/workspaces/${ws['id'] as string}/invitations`, {
        email: person.email,
        role: 'MEMBER',
      });
      const token = String(invite['link']).split('/invite/')[1] ?? '';
      await call(ctx, person.token, 'post', `/invitations/${token}/accept`);
    }
    const board = await call(ctx, owner.token, 'post', `/workspaces/${ws['id'] as string}/boards`, {
      name: 'Website launch',
    });
    const boardId = board['id'] as string;
    const col = async (name: string) =>
      (await call(ctx, owner.token, 'post', `/boards/${boardId}/columns`, { name }))['id'] as string;
    const todo = await col('To do');
    const doing = await col('In progress');
    const done = await col('Done');
    const add = (columnId: string, data: object) =>
      call(ctx, owner.token, 'post', `/columns/${columnId}/cards`, data);
    await add(todo, { title: 'Login page', labels: ['frontend'], assigneeIds: [sara.id] });
    await add(todo, { title: 'Pricing copy', labels: ['marketing'], assigneeIds: [omar.id] });
    await add(todo, { title: 'Onboarding emails', labels: ['growth'] });
    await add(doing, { title: 'Realtime presence', labels: ['frontend'], assigneeIds: [omar.id] });
    await add(done, { title: 'Set up CI', labels: ['devops'], assigneeIds: [sara.id] });
    // Start with empty bells, so the mention later is the only notification on screen.
    for (const person of [sara, omar]) await call(ctx, person.token, 'post', '/notifications/read-all');
    return { boardId, sara, omar };
  } finally {
    await ctx.dispose();
  }
}

/** A browser window for one person, with a name tag in the corner so viewers know whose screen it is. */
async function windowFor(browser: Browser, person: Person, boardId: string, color: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: E2E.webUrl,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });
  await context.addInitScript(
    ({ label, background }) => {
      document.addEventListener('DOMContentLoaded', () => {
        const tag = document.createElement('div');
        tag.textContent = label;
        tag.setAttribute('aria-hidden', 'true');
        tag.style.cssText = `position:fixed;left:10px;bottom:10px;z-index:99999;padding:4px 10px;border-radius:999px;font:600 12px system-ui;color:#fff;background:${background};pointer-events:none`;
        document.body.appendChild(tag);
      });
    },
    { label: `${person.name.split(' ')[0] ?? ''}'s browser`, background: color },
  );
  const page = await context.newPage();
  await page.goto(`/login?next=${encodeURIComponent(`/b/${boardId}`)}`);
  await loginViaUi(page, person);
  await expect(page.getByTestId('card').first()).toBeVisible();
  return page;
}

test('record the live demo GIF', async ({ browser }) => {
  test.setTimeout(240_000);
  const { boardId, sara, omar } = await seed();
  const left = await windowFor(browser, sara, boardId, '#7c3aed');
  const right = await windowFor(browser, omar, boardId, '#0891b2');
  await expect(left.getByTestId('presence-avatar')).toHaveCount(2);
  await expect(right.getByTestId('presence-avatar')).toHaveCount(2);

  const gif = new GifRecorder();
  const snap = async (delay = 120) => {
    const [a, b] = await Promise.all([left.screenshot(), right.screenshot()]);
    gif.add(sideBySide(a, b), delay);
  };
  /** Keeps capturing for `ms`, so a change on the other side shows up as it lands. */
  const film = async (ms: number, every = 150) => {
    const until = Date.now() + ms;
    while (Date.now() < until) await snap(every);
  };

  await snap(1500); // both present

  // 1. Sara drags "Login page" to In progress; Omar sees it move.
  await dragTo(left, card(left, 'Login page'), column(left, 'In progress'));
  await film(600);
  await expect(card(right, 'Login page')).toBeVisible();
  await expect(column(right, 'In progress').getByText('Login page')).toBeVisible();
  await film(900);

  // 2. Omar adds a card; it appears for Sara.
  const addCard = column(right, 'To do').getByRole('button', { name: /add a card/i });
  await addCard.click();
  await film(300);
  await right.keyboard.type('Write release notes', { delay: 25 });
  await film(300);
  await right.keyboard.press('Enter');
  await expect(column(left, 'To do').getByText('Write release notes')).toBeVisible();
  await right.keyboard.press('Escape');
  await film(1200);

  // 3. Omar mentions Sara on the card; her bell lights up.
  await card(right, 'Login page').click();
  const dialog = right.getByRole('dialog');
  const box = dialog.getByRole('combobox', { name: 'Write a comment' });
  await box.click();
  await box.pressSequentially('Looks great ', { delay: 30 });
  await box.pressSequentially('@Sa', { delay: 60 });
  await film(500);
  await dialog.getByRole('option', { name: sara.name }).click();
  await box.pressSequentially('can you add the loading state?', { delay: 20 });
  await film(300);
  await dialog.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(left.getByTestId('unread-badge')).toHaveText('1');
  await film(1800);
  await right.keyboard.press('Escape');

  // 4. Sara opens the activity log.
  await left.getByRole('button', { name: 'Activity' }).click();
  await expect(
    left.getByRole('dialog', { name: 'Activity' }).getByTestId('board-activity-entry').first(),
  ).toBeVisible();
  await film(300);
  // The drawer slides in for 500 ms: let it settle so the last (held) frame shows it fully open.
  await left.waitForTimeout(600);
  await film(600);
  gif.hold(3000);

  const bytes = gif.encode();
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, bytes);
  console.log(`docs/live-demo.gif: ${gif.count} frames, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
  expect(bytes.length, 'GIF too large for the README; shorten the script or the viewport').toBeLessThan(
    MAX_BYTES,
  );
});
