import { type Browser, expect, type Page, test } from '@playwright/test';
import { type Actor, type BoardWorld, card, openBoardAs, setupBoard } from './board-setup';
import { E2E } from './e2e-env';

async function pageFor(browser: Browser, world: BoardWorld, actor: Actor): Promise<Page> {
  const context = await browser.newContext({ baseURL: E2E.webUrl });
  const page = await context.newPage();
  await openBoardAs(page, world, actor);
  await expect(page.getByTestId('presence-avatar').first()).toBeVisible();
  return page;
}

test.describe('notifications', () => {
  test('a mention lights up the bell live, and opening it goes to the card', async ({ browser }) => {
    const world = await setupBoard();
    const owner = await pageFor(browser, world, world.owner);
    const member = await pageFor(browser, world, world.member);
    const bell = member.getByRole('button', { name: /^Notifications/ });
    // Setup assigned the member to a card, so they start with that notification: clear it.
    await expect(bell).toHaveAccessibleName('Notifications, 1 unread');
    await bell.click();
    await expect(member.getByTestId('notification').first()).toContainText(
      `${world.owner.name} assigned you to`,
    );
    await member.getByRole('button', { name: 'Mark all read' }).click();
    await member.keyboard.press('Escape');
    await expect(bell).toHaveAccessibleName('Notifications');

    // The owner mentions the member from the comment box autocomplete.
    await card(owner, 'Alpha').click();
    const dialog = owner.getByRole('dialog');
    const firstName = world.member.name.split(' ')[0] ?? world.member.name;
    const box = dialog.getByRole('combobox', { name: 'Write a comment' });
    await box.fill('Can you take this, ');
    await box.pressSequentially(`@${firstName.slice(0, 3)}`);
    await dialog.getByRole('option', { name: world.member.name }).click();
    await box.pressSequentially('please?');
    await dialog.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(dialog.getByTestId('mention')).toHaveText(`@${world.member.name}`);

    // The member's bell updates without a reload, with a toast too.
    await expect(member.getByTestId('unread-badge')).toHaveText('1');
    await expect(member.getByText(`${world.owner.name} mentioned you in 'Alpha'`).first()).toBeVisible();

    await bell.click();
    const item = member.getByTestId('notification').first();
    await expect(item).toContainText(`${world.owner.name} mentioned you in 'Alpha'`);
    await expect(item).toContainText(`Can you take this, @${world.member.name} please?`);
    await item.click();

    await expect(member).toHaveURL(new RegExp(`card=${world.cards.alpha}`));
    await expect(member.getByRole('dialog')).toBeVisible();
    await expect(member.getByTestId('unread-badge')).toHaveCount(0);
  });
});
