import { type BrowserContext, expect, type Page } from '@playwright/test';
import { AUTH_COOKIES } from '@teamboard/shared';
import { randomUUID } from 'node:crypto';

export const PASSWORD = 'correct horse battery';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export function newUser(): TestUser {
  const id = randomUUID().slice(0, 8);
  return { name: `User ${id}`, email: `user+${id}@test.dev`, password: PASSWORD };
}

export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectSignedIn(page, user);
}

export async function loginViaUi(page: Page, user: Pick<TestUser, 'email' | 'password'>): Promise<void> {
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** On /workspaces with the header showing the user and the authenticated /auth/me call succeeding. */
export async function expectSignedIn(page: Page, user: Pick<TestUser, 'name' | 'email'>): Promise<void> {
  await expect(page).toHaveURL(/\/workspaces$/);
  await expect(page.getByTestId('current-user')).toHaveText(user.name);
  await expect(page.getByTestId('me-status')).toContainText(`Signed in as ${user.email}`);
}

export async function refreshCookie(context: BrowserContext): Promise<string | undefined> {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === AUTH_COOKIES.refreshToken)?.value;
}

/** Resolves when the page's next POST /auth/refresh completes. */
export function waitForRefresh(page: Page) {
  return page.waitForResponse(
    (response) => response.url().endsWith('/auth/refresh') && response.request().method() === 'POST',
  );
}
