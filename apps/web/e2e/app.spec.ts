import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('dashboard shows seeded data, no horizontal overflow on a phone', async ({ page }) => {
  await expect(page.getByText('Start a new match')).toBeVisible();
  await expect(page.getByText('Recent results')).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test('type team and player names, toss, score with extras, wicket, undo; bowler added by typing', async ({ page }) => {
  await page.goto('/#/matches/new');
  await page.getByPlaceholder('e.g. Eagles').fill('Eagles');
  await page.getByPlaceholder('e.g. Tigers').fill('Tigers');
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Add a player to Eagles').fill('Ali, Bob, Cid');
  await page.getByLabel('Add a player to Eagles').press('Enter');
  await page.getByLabel('Add a player to Tigers').fill('Dan, Eve, Fay');
  await page.getByLabel('Add a player to Tigers').press('Enter');
  await expect(page.getByText('Ali', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Eagles' }).click();
  await page.getByRole('button', { name: /Bat/ }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.getByRole('button', { name: 'Start scoring' }).click();

  // bowler who is not in the list yet: type the name
  await page.getByLabel('Add a new bowler (type name)').fill('Zed');
  await page.getByLabel('Add a new bowler (type name)').press('Enter');
  const score = page.getByTestId('score');
  await expect(page.getByTestId('on-strike')).toContainText('Ali');
  await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(page.getByTestId('on-strike')).toContainText('Bob');   // single: strike moves, other name highlights
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.getByTestId('on-strike')).toContainText('Bob');   // double: same batter stays on strike
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await expect(score).toHaveText('9/0');
  await page.getByRole('button', { name: 'Wide +1' }).click();
  await expect(score).toHaveText('10/0');
  await page.getByRole('button', { name: 'No ball +1' }).click();
  await expect(score).toHaveText('11/0');
  await expect(page.getByText('FREE HIT').first()).toBeVisible();
  await page.getByRole('button', { name: '6 off bat' }).click();
  await expect(score).toHaveText('17/0');
  // free hit: the wicket screen only offers dismissals that are possible
  await page.getByRole('button', { name: 'OUT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bowled' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run out' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(score).toHaveText('19/0');
  await page.getByRole('button', { name: 'OUT', exact: true }).click();
  await page.getByRole('button', { name: 'Bowled' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cid' }).click();
  await page.getByRole('button', { name: 'Confirm out' }).click();
  await expect(score).toHaveText('19/1');
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(score).toHaveText('19/0');
  await page.getByRole('button', { name: /More/ }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(score).toHaveText('19/1');
  await page.getByRole('tab', { name: 'Scorecard' }).click();
  await expect(page.getByText('Zed').first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('score')).toHaveText('19/1');
});

test('sample completed match: scorecard, analytics, players, tournament table', async ({ page }) => {
  await page.goto('/#/matches/m_1');
  await expect(page.getByText('Fall of wickets').first()).toBeVisible();
  await page.goto('/#/analytics');
  await expect(page.getByText('Runs by over')).toBeVisible();
  await page.goto('/#/tournaments');
  await expect(page.getByText('Points table')).toBeVisible();
  await page.goto('/#/players');
  await page.locator('button', { hasText: 'runs' }).first().click();
  await expect(page.getByText('Batting', { exact: true })).toBeVisible();
});

test('scheduled match without a toss asks for one instead of crashing', async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/#/scoring/m_5');
  await expect(page.getByText(': toss')).toBeVisible();
  await page.getByRole('button', { name: 'Save toss and continue' }).click();
  await expect(page.getByText(/won the toss and chose to bat/)).toBeVisible();
});

test('global search opens a player even when already on the players page', async ({ page }) => {
  await page.goto('/#/players');
  await page.getByLabel('Global search').fill('Arjun');
  await page.getByRole('button', { name: /Arjun Khan/ }).first().click();
  await expect(page.getByText(/Arjun Khan/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Global search').fill('Bilal');
  await page.getByRole('button', { name: /Bilal Ahmed/ }).first().click();
  await expect(page.getByRole('dialog').getByText(/Bilal Ahmed/).first()).toBeVisible();
});
