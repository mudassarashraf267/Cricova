import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function startMatch(page: Page, o: { overs?: string; quick?: boolean; pa?: string; pb?: string } = {}) {
  await page.goto('/#/matches/new');
  await page.getByPlaceholder('e.g. Eagles').fill('Eagles');
  await page.getByPlaceholder('e.g. Tigers').fill('Tigers');
  await page.getByLabel('Other number of overs').fill(o.overs ?? '2');
  if (o.quick) { await page.getByText('More options').click(); await page.getByLabel(/only want to type/).check(); }
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Add a player to Eagles').fill(o.pa ?? 'Ali, Bob, Cid'); await page.getByLabel('Add a player to Eagles').press('Enter');
  await page.getByLabel('Add a player to Tigers').fill(o.pb ?? 'Dan, Eve, Fay'); await page.getByLabel('Add a player to Tigers').press('Enter');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Eagles' }).click();
  await page.getByRole('button', { name: /Bat/ }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
}
const run = (page: Page, n: number | string) => page.getByRole('button', { name: String(n), exact: true }).click();
const dot = (page: Page) => page.getByRole('button', { name: '•' }).click();
const score = (page: Page) => page.getByTestId('score');
async function out(page: Page, kind: string, opts: { fielder?: string; next?: string } = {}) {
  await page.getByRole('button', { name: 'OUT', exact: true }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: kind, exact: true }).click();
  if (opts.fielder) await d.getByRole('button', { name: opts.fielder, exact: true }).click();
  if (opts.next) await d.getByRole('button', { name: opts.next, exact: true }).click();
  await d.getByRole('button', { name: 'Confirm out' }).click();
}

test('a whole match: batting, bowling, over changes, all-out, chase, result', async ({ page }) => {
  await startMatch(page);
  await page.getByRole('button', { name: 'Start scoring' }).click();
  await page.getByRole('button', { name: /^Dan/ }).click();                       // over 1: Dan
  await run(page, 1);                                                              // Ali single
  await expect(page.getByTestId('on-strike')).toContainText('Bob');
  await out(page, 'Caught', { fielder: 'Fay', next: 'Cid' });                      // Bob c Fay b Dan
  await expect(score(page)).toHaveText('1/1');
  await expect(page.getByTestId('on-strike')).toContainText('Cid');
  await run(page, 4); await page.getByRole('button', { name: 'Wide +1' }).click(); // 5 then wide = 6
  await expect(score(page)).toHaveText('6/1');
  await dot(page); await run(page, 6);
  await expect(score(page)).toHaveText('12/1');
  await run(page, 2);                                                              // 6th legal ball
  await expect(score(page)).toHaveText('14/1');
  // over 2: Dan is not allowed to bowl again, Eve is
  await expect(page.getByRole('button', { name: /^Dan/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Eve/ }).click();
  await expect(page.getByTestId('on-strike')).toContainText('Ali');                // ends changed
  await out(page, 'Bowled');                                                       // last wicket: Ali b Eve, all out
  await expect(page.getByText('Innings 1 finished')).toBeVisible();
  await expect(page.getByText('Tigers need 15 to win')).toBeVisible();

  // scorecard checks
  await expect(page.getByText('c Fay b Dan')).toBeVisible();
  await expect(page.getByText('b Eve', { exact: true })).toBeVisible();
  await expect(page.getByText('wd 1, nb 0, b 0, lb 0, pen 0')).toBeVisible();

  // innings 2: chase
  await page.getByRole('button', { name: 'Start scoring' }).click();
  await page.getByRole('button', { name: /^Ali/ }).click();
  await run(page, 6); await run(page, 6);
  await expect(page.getByText(/Need 3 runs/)).toBeVisible();
  await run(page, 4);
  await expect(page.getByText('Finalize match & view report')).toBeVisible();
  await expect(page.getByText(/Tigers won by 2 wickets/)).toBeVisible();
  await page.getByRole('button', { name: 'Finalize match & view report' }).click();
  await expect(page.getByText('Tigers won by 2 wickets').first()).toBeVisible();
  // downloads a CSV with both innings
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /CSV/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.csv$/);
  // stats now exist for the players
  await page.goto('/#/players');
  await expect(page.getByText('12 runs')).toBeVisible();   // Cid
});

test('more menu: change bowler mid-over, retire, penalty, add player, redo, fix and remove a ball', async ({ page }) => {
  await startMatch(page, { overs: '5', pa: 'Ali, Bob, Cid, Dev', pb: 'Dan, Eve, Fay, Gus' });
  await page.getByRole('button', { name: 'Start scoring' }).click();
  await page.getByRole('button', { name: /^Dan/ }).click();
  await run(page, 2); await run(page, 3);
  await expect(score(page)).toHaveText('5/0');
  // bowler cannot finish the over: Eve takes over
  await page.getByRole('button', { name: /More/ }).click(); await page.getByRole('button', { name: 'Change bowler (mid-over)' }).click();
  await page.getByRole('button', { name: /^Eve/ }).click();
  await run(page, 1);
  await page.getByRole('tab', { name: 'Scorecard' }).click();
  await expect(page.getByRole('cell', { name: 'Dan', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Eve', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Score', exact: true }).click();
  // penalty runs
  await page.getByRole('button', { name: /More/ }).click(); await page.getByRole('button', { name: 'Penalty runs, rain or revised target' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(score(page)).toHaveText('11/0');
  // retired hurt: next batter comes in, not a wicket
  await page.getByRole('button', { name: /More/ }).click(); await page.getByRole('button', { name: 'Batter retired / timed out' }).click();
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(score(page)).toHaveText('11/0');
  // add a player by name mid-match
  await page.getByRole('button', { name: /More/ }).click(); await page.getByRole('button', { name: 'Add a player' }).click();
  await page.getByLabel('Player name').first().fill('Hal'); await page.getByLabel('Player name').first().press('Enter');
  // undo + redo
  await run(page, 4);
  const before = await score(page).textContent();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(score(page)).not.toHaveText(before!);
  await page.getByRole('button', { name: /More/ }).click(); await page.getByRole('button', { name: 'Redo' }).click();
  await expect(score(page)).toHaveText(before!);
  // fix the last ball: 4 -> 6, with a reason
  await page.getByRole('button', { name: /More/ }).click(); await page.getByRole('button', { name: 'Fix an earlier ball' }).click();
  await page.getByRole('button', { name: 'Change' }).first().click();
  await page.getByLabel('Runs off the bat').fill('6');
  await page.getByLabel('Ball reached boundary').selectOption('6');
  await page.getByLabel(/Reason/).fill('was a six');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(score(page)).toHaveText('17/0');
  // remove it entirely
  await page.getByRole('button', { name: /More/ }).click(); await page.getByRole('button', { name: 'Fix an earlier ball' }).click();
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await page.getByLabel(/Reason/).fill('duplicate');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(score(page)).toHaveText('11/0');
});

test('other dismissals: lbw, stumped, run out with runs, hit wicket', async ({ page }) => {
  await startMatch(page, { overs: '5', pa: 'A1, A2, A3, A4, A5, A6', pb: 'B1, B2, B3, B4, B5, B6' });
  await page.getByRole('button', { name: 'Start scoring' }).click();
  await page.getByRole('button', { name: /^B1/ }).click();
  await out(page, 'LBW', { next: 'A3' });
  await expect(score(page)).toHaveText('0/1');
  await out(page, 'Stumped', { fielder: 'B6', next: 'A4' });
  await out(page, 'Hit wicket', { next: 'A5' });
  await expect(score(page)).toHaveText('0/3');
  // run out of the non-striker after 1 run
  await page.getByRole('button', { name: 'OUT', exact: true }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Run out' }).click();
  await d.getByRole('button', { name: 'A2', exact: true }).click();
  await d.getByRole('button', { name: '1', exact: true }).click();
  await d.getByRole('button', { name: 'B3', exact: true }).click();
  await d.getByRole('button', { name: 'A6', exact: true }).click();
  await d.getByRole('button', { name: 'Confirm out' }).click();
  await expect(score(page)).toHaveText('1/4');
  await page.getByRole('tab', { name: 'Scorecard' }).click();
  await expect(page.getByText('lbw b B1')).toBeVisible();
  await expect(page.getByText('st B6 b B1')).toBeVisible();
  await expect(page.getByText('hit wicket b B1')).toBeVisible();
  await expect(page.getByText(/run out \(B3\)/)).toBeVisible();
});

test('quick score mode records manual totals and is labelled as manual', async ({ page }) => {
  await startMatch(page, { overs: '10', quick: true });
  await expect(page.getByText(/entered by hand/)).toBeVisible();
  await page.getByLabel('runs', { exact: true }).fill('80'); await page.getByLabel('wickets', { exact: true }).fill('4'); await page.getByLabel('Overs (e.g. 18.3)').fill('10.0');
  await page.getByRole('button', { name: /Save innings 1/ }).click();
  await page.getByLabel('runs', { exact: true }).fill('75'); await page.getByLabel('wickets', { exact: true }).fill('9'); await page.getByLabel('Overs (e.g. 18.3)').fill('10.0');
  await page.getByRole('button', { name: /Save innings 2/ }).click();
  await expect(page.getByText('Eagles won by 5 runs').first()).toBeVisible();
  await expect(page.getByText(/Entered manually/).first()).toBeVisible();
});

test('players, teams and tournaments can be created, edited and deleted', async ({ page }) => {
  await page.goto('/#/players');
  await page.getByLabel('New player name').fill('Zara Khan, Yusuf Ali'); await page.getByLabel('New player name').press('Enter');
  await expect(page.getByText('Zara Khan')).toBeVisible(); await expect(page.getByText('Yusuf Ali')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Zara Khan' }).click();
  await page.getByLabel('Full name *').fill('Zara K'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Zara K', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Yusuf Ali' }).click(); await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Yusuf Ali')).toHaveCount(0);

  await page.goto('/#/teams');
  await page.getByRole('button', { name: /New team/ }).click();
  await page.getByLabel('Team name *').fill('Lions');
  await page.getByPlaceholder('Type a player name and press Enter').fill('Leo'); await page.getByPlaceholder('Type a player name and press Enter').press('Enter');
  await page.getByRole('button', { name: 'Save team' }).click();
  await expect(page.getByText('Lions').first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete Lions' }).click(); await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Lions')).toHaveCount(0);

  await page.goto('/#/tournaments');
  await page.getByRole('button', { name: /Create tournament/ }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill('Cup');
  await page.getByRole('dialog').getByRole('checkbox').nth(0).check(); await page.getByRole('dialog').getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Generate round-robin' }).click();
  await expect(page.getByText('Points table')).toBeVisible();
  await expect(page.getByText(/league/i).first()).toBeVisible();
});

test('strike after 3 runs, tap-to-set-strike override, international over display', async ({ page }) => {
  await startMatch(page, { overs: '5', pa: 'Ali, Bob, Cid', pb: 'Dan, Eve, Fay' });
  await page.getByRole('button', { name: 'Start scoring' }).click();
  await page.getByRole('button', { name: /^Dan/ }).click();
  await run(page, 3);                                                         // Ali ran three: ends at the far end
  await expect(score(page)).toHaveText('3/0');
  await expect(page.getByTestId('on-strike')).toContainText('Bob');          // so Bob faces the next ball (Laws of Cricket)
  await page.getByRole('button', { name: 'Put Ali on strike' }).click();     // scorer override
  await expect(page.getByTestId('on-strike')).toContainText('Ali');
  await expect(score(page)).toHaveText('3/0');                               // nothing scored
  await run(page, 1);
  await expect(page.getByTestId('on-strike')).toContainText('Bob');
  // bowler line: overs . maidens . runs . wickets . economy
  await expect(page.getByTestId('bowler-line')).toHaveText('0.2 · 0 · 4 · 0 · 12.00');
  // finish the over, then the scorecard shows an over summary row with balls, runs and score
  await dot(page); await dot(page); await run(page, 4); await page.getByRole('button', { name: 'Wide +1' }).click(); await run(page, 6);
  await page.getByRole('tab', { name: 'Scorecard' }).click();
  const row = page.getByRole('row', { name: /^1 0.1.0.6 Dan/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('3');
  await expect(row).toContainText('15/0');
});

test('delete all players and all teams with one button each; old matches keep their names', async ({ page }) => {
  await page.goto('/#/players');
  await page.getByRole('button', { name: 'Delete all players' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete all players' }).click();
  await expect(page.getByText('No players match')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete all players' })).toHaveCount(0);

  await page.goto('/#/teams');
  await page.getByRole('button', { name: 'Delete all teams' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete all teams' }).click();
  await expect(page.getByText('No teams yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete all teams' })).toHaveCount(0);

  // a finished match is untouched
  await page.goto('/#/matches/m_1');
  await expect(page.getByText('Fall of wickets').first()).toBeVisible();
  await expect(page.getByText('Riverside Rangers').first()).toBeVisible();
});

test('overs count like international cricket: 0.0, 0.1 ... 0.6 -> 1.0, 1.1 ... until the innings ends', async ({ page }) => {
  await startMatch(page, { overs: '2' });
  await page.getByRole('button', { name: 'Start scoring' }).click();
  const overs = page.getByTestId('overs');
  await expect(overs).toHaveText(/^0\.0/);
  await page.getByRole('button', { name: /^Dan/ }).click();
  await expect(overs).toHaveText(/^0\.0/);
  for (const expected of ['0.1', '0.2', '0.3']) { await dot(page); await expect(overs).toHaveText(new RegExp('^' + expected.replace('.', '\.'))); }
  // a wide is not a legal ball: the counter stays, the next legal ball is still the next number
  await page.getByRole('button', { name: 'Wide +1' }).click();
  await expect(overs).toHaveText(/^0\.3/);
  for (const expected of ['0.4', '0.5']) { await dot(page); await expect(overs).toHaveText(new RegExp('^' + expected.replace('.', '\.'))); }
  await dot(page);                                                                     // 6th legal ball
  await expect(overs).toHaveText(/^1\.0/);
  // ball numbers of the finished over run 0.1 ... 0.6 (the wide shares the number of the ball it is re-bowled as)
  const labels = await page.getByTestId('ball-no').allTextContents();
  expect(labels).toEqual(['0.1', '0.2', '0.3', '0.4', '0.4', '0.5', '0.6']);
  // second over starts at 1.1
  await page.getByRole('button', { name: /^Eve/ }).click();
  await dot(page);
  await expect(overs).toHaveText(/^1\.1/);
  expect(await page.getByTestId('ball-no').allTextContents()).toEqual(['1.1']);
  for (const expected of ['1.2', '1.3', '1.4', '1.5']) { await dot(page); await expect(overs).toHaveText(new RegExp('^' + expected.replace('.', '\.'))); }
  await dot(page);                                                                     // 12th legal ball: innings complete
  await expect(page.getByText(/Innings 1 finished \(overs completed\)/)).toBeVisible();
  await expect(page.getByText(/2\.0 ov/).first()).toBeVisible();
});

test('compare teams: head to head and record; compare players still works', async ({ page }) => {
  await page.goto('/#/compare');
  await expect(page.getByRole('tab', { name: /Players/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('cell', { name: 'Batting average' })).toBeVisible();
  await page.getByRole('tab', { name: /Teams/ }).click();
  await expect(page.getByTestId('h2h')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Net run rate' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Win %' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Runs conceded' })).toBeVisible();
});

test('delete all stats removes matches and resets stats but keeps players and teams', async ({ page }) => {
  await page.goto('/#/analytics');
  await page.getByRole('button', { name: 'Delete all stats' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete all stats' }).click();
  await expect(page.getByText(/Analytics need at least one/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete all stats' })).toBeDisabled();
  await page.goto('/#/matches');
  await expect(page.getByText('No matches here yet.')).toBeVisible();
  await page.goto('/#/players');
  await expect(page.getByRole('button', { name: 'Delete all players' })).toBeVisible();   // players are still there
  await page.goto('/#/teams');
  await expect(page.getByRole('button', { name: 'Delete all teams' })).toBeVisible();
});

test('schedule an upcoming match with date and time, change it, then start it from the calendar', async ({ page }) => {
  await page.goto('/#/matches');
  await page.getByRole('button', { name: 'Schedule match' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Add to upcoming' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Type both team names');
  await dlg.getByPlaceholder('e.g. Eagles').fill('Zebras'); await dlg.getByPlaceholder('e.g. Tigers').fill('Yaks');
  await dlg.getByLabel('Date').fill('2031-03-15'); await dlg.getByLabel('Time').fill('09:30');
  await dlg.getByLabel('Ground (optional)').fill('Park Oval');
  await dlg.getByRole('button', { name: '5', exact: true }).click();
  await dlg.getByRole('button', { name: 'Add to upcoming' }).click();
  const card = page.locator('.card', { hasText: 'Zebras vs Yaks' });
  await expect(card).toContainText('upcoming');
  await expect(card.getByTestId('when')).toContainText('2031');
  await expect(card.getByTestId('when')).toContainText(/9:30|09:30/);
  await expect(card).toContainText('Park Oval');
  // reschedule
  await card.getByRole('button', { name: 'Change date / time' }).click();
  await page.getByRole('dialog').getByLabel('Time').fill('18:45');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(card.getByTestId('when')).toContainText(/6:45|18:45/);
  // shows on the home page
  await page.goto('/#/');
  await expect(page.getByTestId('upcoming')).toContainText('Zebras vs Yaks');
  // start it: teams and overs are already filled in
  await page.goto('/#/matches');
  await page.locator('.card', { hasText: 'Zebras vs Yaks' }).getByRole('link', { name: 'Start match' }).click();
  await expect(page.getByPlaceholder('e.g. Eagles')).toHaveValue('Zebras');
  await expect(page.getByPlaceholder('e.g. Tigers')).toHaveValue('Yaks');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Add a player to Zebras').fill('Ali, Bob'); await page.getByLabel('Add a player to Zebras').press('Enter');
  await page.getByLabel('Add a player to Yaks').fill('Dan, Eve'); await page.getByLabel('Add a player to Yaks').press('Enter');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Zebras', exact: true }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page).toHaveURL(/scoring/);
  // the calendar entry was replaced, not duplicated
  await page.goto('/#/matches');
  await expect(page.locator('.card', { hasText: 'Zebras vs Yaks' })).toHaveCount(1);
  await expect(page.locator('.card', { hasText: 'Zebras vs Yaks' })).not.toContainText('2031');   // the scheduled entry was replaced by the real match
});

