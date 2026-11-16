import { expect, test } from '@playwright/test';
import { E2E } from './e2e-env';
import { loginViaUi } from './fixtures';
import {
  card,
  cardTitles,
  column,
  columnNames,
  dragTo,
  liveRegion,
  openBoardAs,
  pickUp,
  setupBoard,
} from './board-setup';

test.describe('board', () => {
  test('a member drags a card to another column with the mouse, and it sticks', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.member);

    await dragTo(page, card(page, 'Beta'), column(page, 'Done'));

    await expect.poll(() => cardTitles(page, 'Done')).toEqual(['Beta']);
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Alpha', 'Gamma']);
    await page.reload();
    await expect.poll(() => cardTitles(page, 'Done')).toEqual(['Beta']);
  });

  test('a member reorders within a column by dragging', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.member);

    await dragTo(page, card(page, 'Gamma'), card(page, 'Alpha'), 0.25);

    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Gamma', 'Alpha', 'Beta']);
    await page.reload();
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  test('cards move with the keyboard alone, with screen-reader announcements', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.member);

    // Each step waits for its announcement, as a screen-reader user would hear it.
    const announced = (text: string | RegExp) => expect(liveRegion(page)).toContainText(text);

    await pickUp(page, card(page, 'Delta'), 'card “Delta” is now at position 1 of 1 in column “Doing”');
    await expect(card(page, 'Delta')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await announced('position 1 of 1 in column “Done”');
    await page.keyboard.press('Space');
    await announced('Dropped card “Delta” at position 1 of 1 in column “Done”');
    await expect.poll(() => cardTitles(page, 'Done')).toEqual(['Delta']);

    // Within a column: Alpha down one.
    await pickUp(page, card(page, 'Alpha'), 'card “Alpha” is now at position 1 of 3');
    await page.keyboard.press('ArrowDown');
    await announced('card “Alpha” is now at position 2 of 3');
    await page.keyboard.press('Space');
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Beta', 'Alpha', 'Gamma']);

    await page.reload();
    await expect.poll(() => cardTitles(page, 'Done')).toEqual(['Delta']);
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  test('the owner reorders columns (keyboard on the handle and mouse)', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.owner);

    await pickUp(
      page,
      page.getByRole('button', { name: 'Reorder column Done' }),
      'column “Done” is now at the place of column “Done”',
    );
    await page.keyboard.press('ArrowLeft');
    await expect(liveRegion(page)).toContainText('at the place of column “Doing”');
    await page.keyboard.press('ArrowLeft');
    await expect(liveRegion(page)).toContainText('at the place of column “To do”');
    const saved = page.waitForResponse(
      (r) => /\/columns\/[^/]+\/move$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.keyboard.press('Space');
    await expect.poll(() => columnNames(page)).toEqual(['Done', 'To do', 'Doing']);
    // Let the keyboard drop finish (saved + drop animation) before grabbing another column with the mouse.
    expect((await saved).status()).toBe(200);
    await page.waitForTimeout(300);

    await dragTo(page, page.getByRole('button', { name: 'Reorder column To do' }), column(page, 'Doing'));
    await expect.poll(() => columnNames(page)).toEqual(['Done', 'Doing', 'To do']);

    await page.reload();
    await expect.poll(() => columnNames(page)).toEqual(['Done', 'Doing', 'To do']);
  });

  test('a rejected move snaps back and explains why', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.member);
    await page.route('**/cards/*/move', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.continue();
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': E2E.webUrl, 'Access-Control-Allow-Credentials': 'true' },
        body: JSON.stringify({ statusCode: 403, error: 'Forbidden', code: 'forbidden', message: 'nope' }),
      });
    });

    await dragTo(page, card(page, 'Beta'), column(page, 'Done'));

    await expect(page.getByText("You don't have permission to do that.")).toBeVisible();
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Alpha', 'Beta', 'Gamma']);
    await expect.poll(() => cardTitles(page, 'Done')).toEqual([]);
    await page.unroute('**/cards/*/move');
    await page.reload();
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('a member edits everything in the card modal, and it all persists', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.member);

    await card(page, 'Beta').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`card=${world.cards.beta}`));

    const title = dialog.getByRole('textbox', { name: 'Card title' });
    await title.fill('Beta launch notes');
    await title.press('Enter');

    await dialog
      .getByRole('textbox', { name: 'Description (markdown)' })
      .fill('## Release plan\n\n- [ ] write changelog');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Release plan' })).toBeVisible();

    await dialog.getByRole('combobox', { name: 'Add label' }).fill('urgent');
    await dialog.getByRole('combobox', { name: 'Add label' }).press('Enter');
    await expect(dialog.getByRole('button', { name: 'Remove label urgent' })).toBeVisible();

    await dialog.getByLabel('Due date', { exact: true }).fill('2030-01-15');
    await dialog.getByRole('button', { name: 'Assign members' }).click();
    await page.getByRole('checkbox', { name: world.member.name }).click();
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('list', { name: 'Assignees' })).toContainText(world.member.name);

    await dialog.getByRole('combobox', { name: 'Write a comment' }).fill('Ready for **review**');
    await dialog.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(dialog.getByTestId('comment').filter({ hasText: 'Ready for review' })).toBeVisible();

    await dialog.getByRole('tab', { name: 'Activity' }).click();
    await expect(dialog.getByText("renamed this card from 'Beta' to 'Beta launch notes'")).toBeVisible();
    await expect(dialog.getByText(/commented/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(card(page, 'Beta launch notes')).toContainText('urgent');

    await page.reload();
    await card(page, 'Beta launch notes').click();
    const reopened = page.getByRole('dialog');
    await expect(reopened.getByRole('heading', { name: 'Release plan' })).toBeVisible();
    await expect(reopened.getByLabel('Due date', { exact: true })).toHaveValue('2030-01-15');
    await expect(reopened.getByRole('list', { name: 'Assignees' })).toContainText(world.member.name);
    await expect(reopened.getByTestId('comment')).toContainText('Ready for review');
  });

  test('a member adds a card; the owner adds and renames a column', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.owner);

    await page.getByRole('button', { name: 'Add a card to Doing' }).click();
    await page.getByRole('textbox', { name: 'New card title in Doing' }).fill('Epsilon');
    await page.keyboard.press('Enter');
    await expect.poll(() => cardTitles(page, 'Doing')).toEqual(['Delta', 'Epsilon']);

    await page.getByRole('button', { name: 'Add column' }).click();
    await page.getByRole('textbox', { name: 'New column name' }).fill('Review');
    await page.keyboard.press('Enter');
    await expect.poll(() => columnNames(page)).toEqual(['To do', 'Doing', 'Done', 'Review']);

    await page.getByRole('button', { name: 'Column actions for Review' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByRole('textbox', { name: 'Column name' }).fill('QA');
    await page.keyboard.press('Enter');

    await page.reload();
    await expect.poll(() => columnNames(page)).toEqual(['To do', 'Doing', 'Done', 'QA']);
    await expect.poll(() => cardTitles(page, 'Doing')).toEqual(['Delta', 'Epsilon']);
  });

  test('filters narrow the board, live in the URL and survive a reload', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.member);
    const status = page.getByTestId('filter-status');
    await expect(status).toHaveText('4 cards');

    await page.getByRole('searchbox', { name: 'Search cards' }).fill('gam');
    await expect(status).toHaveText('Showing 1 of 4 cards');
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Gamma']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(status).toHaveText('4 cards');

    await page.getByRole('button', { name: 'Filter by label' }).click();
    await page.getByRole('checkbox', { name: 'docs' }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Beta']);
    await page.getByRole('button', { name: 'Clear filters' }).click();

    await page.getByRole('button', { name: 'Filter by assignee' }).click();
    await page.getByRole('checkbox', { name: world.member.name }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Alpha']);
    await expect.poll(() => cardTitles(page, 'Doing')).toEqual([]);

    await page.getByRole('combobox', { name: 'Filter by due date' }).click();
    await page.getByRole('option', { name: 'Overdue' }).click();
    await expect(page).toHaveURL(/assignee=.*due=overdue/);
    await page.reload();
    await expect(status).toHaveText('Showing 1 of 4 cards');
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Alpha']);
  });

  test('a viewer sees everything but cannot drag or edit', async ({ page }) => {
    const world = await setupBoard();
    await openBoardAs(page, world, world.viewer);

    await expect(page.getByText('View only')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add a card/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add column' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Reorder column/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Column actions/ })).toHaveCount(0);

    // Keyboard pick-up does nothing.
    await card(page, 'Delta').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    // Mouse drag does nothing.
    await dragTo(page, card(page, 'Beta'), column(page, 'Done'));
    await expect.poll(() => cardTitles(page, 'Done')).toEqual([]);
    await page.reload();
    await expect.poll(() => cardTitles(page, 'To do')).toEqual(['Alpha', 'Beta', 'Gamma']);
    await expect.poll(() => cardTitles(page, 'Doing')).toEqual(['Delta']);

    // The modal is read-only but shows everything.
    await card(page, 'Alpha').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Delete card' })).toHaveCount(0);
    await expect(dialog.getByText('bug')).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Assignees' })).toContainText(world.member.name);
    await expect(dialog.getByText('No comments yet.')).toBeVisible();
    await dialog.getByRole('tab', { name: 'Activity' }).click();
    await expect(dialog.getByText(/created this card in To do/)).toBeVisible();
  });

  test('the workspace list links to the board', async ({ page }) => {
    const world = await setupBoard();
    await page.goto('/login');
    await loginViaUi(page, world.member);
    await expect(page.getByRole('heading', { level: 2, name: world.workspaceName })).toBeVisible();
    await page.getByRole('link', { name: world.boardName }).click();
    await expect(page).toHaveURL(new RegExp(`/b/${world.boardId}`));
    await expect(page.getByRole('heading', { level: 1, name: world.boardName })).toBeVisible();
  });
});
