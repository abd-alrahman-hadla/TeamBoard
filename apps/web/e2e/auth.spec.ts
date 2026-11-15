import { expect, request, test } from '@playwright/test';
import { AUTH_COOKIES } from '@teamboard/shared';
import { E2E } from './e2e-env';
import {
  expectSignedIn,
  loginViaUi,
  newUser,
  refreshCookie,
  registerViaUi,
  waitForRefresh,
} from './fixtures';

test.describe('auth flow', () => {
  test('register lands on the workspaces page signed in', async ({ page, context }) => {
    const user = newUser();
    await registerViaUi(page, user);

    const cookies = await context.cookies();
    const rt = cookies.find((c) => c.name === AUTH_COOKIES.refreshToken);
    expect(rt).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/auth' });
    // The access token is never persisted in the browser.
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).toBe('{}');
  });

  test('protected routes redirect to login and come back after signing in', async ({ page, browser }) => {
    const user = newUser();
    const setup = await browser.newPage();
    await registerViaUi(setup, user);
    await setup.close();

    await page.goto('/workspaces');
    await expect(page).toHaveURL(/\/login\?next=%2Fworkspaces$/);
    await loginViaUi(page, user);
    await expectSignedIn(page, user);
  });

  test('wrong password and duplicate email show errors', async ({ page, browser }) => {
    const user = newUser();
    const setup = await browser.newPage();
    await registerViaUi(setup, user);
    await setup.close();

    await page.goto('/login');
    await loginViaUi(page, { email: user.email, password: 'definitely wrong' });
    // Next.js renders its own (empty) role="alert" route announcer, so target the form's alert.
    await expect(page.getByTestId('form-alert')).toHaveText('Invalid email or password.');
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/register');
    await page.getByLabel('Name').fill('Someone else');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('another long password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('An account with this email already exists.')).toBeVisible();
  });

  test('a reload keeps the session through a silent refresh', async ({ page }) => {
    const user = newUser();
    await registerViaUi(page, user);

    const refreshed = waitForRefresh(page);
    await page.reload();
    expect((await refreshed).status()).toBe(200);
    await expectSignedIn(page, user);
  });

  test('the access token is refreshed silently before it expires', async ({ page, context }) => {
    const user = newUser();
    await registerViaUi(page, user);
    const before = await refreshCookie(context);

    // Access tokens live 10s in e2e; the client refreshes at 75% of that.
    const refreshed = await waitForRefresh(page);
    expect(refreshed.status()).toBe(200);
    expect(await refreshCookie(context)).not.toBe(before);

    // Well past the first token's expiry, authenticated calls still work.
    await page.waitForTimeout(E2E.accessTokenTtlSeconds * 1000);
    const me = page.waitForResponse((r) => r.url().endsWith('/auth/me'));
    await page.reload();
    expect((await me).status()).toBe(200);
    await expectSignedIn(page, user);
  });

  test('two tabs refreshing at the same time both stay signed in', async ({ context }) => {
    const user = newUser();
    const first = await context.newPage();
    await registerViaUi(first, user);
    const second = await context.newPage();
    await second.goto('/workspaces');
    await expectSignedIn(second, user);

    // Both tabs share one refresh cookie. Without the cross-tab lock, the second refresh would
    // present an already-rotated token and the server would revoke the session as stolen.
    await Promise.all([first.reload(), second.reload()]);
    await expectSignedIn(first, user);
    await expectSignedIn(second, user);
  });

  test('sign out ends the session', async ({ page }) => {
    const user = newUser();
    await registerViaUi(page, user);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.goto('/workspaces');
    await expect(page).toHaveURL(/\/login\?next=%2Fworkspaces$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('replaying a rotated refresh token is rejected and revokes the victim session', async ({
    page,
    context,
  }) => {
    const user = newUser();
    await registerViaUi(page, user);

    // An attacker steals the current refresh token...
    const stolen = await refreshCookie(context);
    expect(stolen).toBeTruthy();

    // ...the legitimate user keeps working, which rotates the token.
    const rotated = waitForRefresh(page);
    await page.reload();
    expect((await rotated).status()).toBe(200);
    await expectSignedIn(page, user);
    expect(await refreshCookie(context)).not.toBe(stolen);

    // The attacker replays the stolen token from their own client.
    const attacker = await request.newContext({ baseURL: E2E.apiUrl });
    const replay = await attacker.post('/auth/refresh', {
      headers: { Origin: E2E.webUrl, Cookie: `${AUTH_COOKIES.refreshToken}=${stolen ?? ''}` },
    });
    expect(replay.status()).toBe(401);
    expect(await replay.json()).toMatchObject({ code: 'refresh_token_reused' });
    await attacker.dispose();

    // Reuse revoked the whole token family: the victim's next refresh fails and they must sign in again.
    const victimRefresh = waitForRefresh(page);
    await page.reload();
    const response = await victimRefresh;
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'refresh_token_reused' });
    await expect(page).toHaveURL(/\/login\?next=%2Fworkspaces$/);
    expect(await refreshCookie(context)).toBeUndefined();
  });
});
