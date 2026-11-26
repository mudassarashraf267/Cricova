import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

async function fresh(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/#/settings');
  return page;
}
async function connect(page: Page, mode: 'setup' | 'login', username: string, password: string) {
  await page.getByLabel('Server address').fill('');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: mode === 'setup' ? 'Create admin account' : 'Sign in' }).click();
}

test('two devices share data through the server, roles are enforced, offline changes queue', async ({ browser }) => {
  const a = await fresh(browser);
  await connect(a, 'setup', 'boss', 'longenough1');
  await a.getByRole('button', { name: /Upload this device/ }).click();
  await expect(a.getByText('Online, in sync')).toBeVisible();

  // server now holds the sample data
  const snap = await a.evaluate(async () => {
    const t = JSON.parse(localStorage.getItem('cricketpro.sync.v1')!).token;
    return (await fetch('/api/db', { headers: { authorization: `Bearer ${t}` } })).json();
  });
  expect(snap.players.length).toBeGreaterThan(5);
  const localMatches = await a.evaluate(() => JSON.parse(localStorage.getItem('cricketpro.db.v1')!).matches.length as number);
  expect(snap.matches.length).toBe(localMatches);

  // admin adds a scorer and a viewer
  for (const [u, role] of [['sam', 'scorer'], ['vera', 'viewer']] as const) {
    await a.getByLabel('New username').fill(u);
    await a.getByLabel('New password').fill('password123');
    await a.getByLabel('New role').selectOption(role);
    await a.getByRole('button', { name: 'Add account' }).click();
    await expect(a.getByLabel(`Role for ${u}`)).toHaveValue(role);
  }

  // device B (scorer) downloads the server data and sees live changes from A
  const b = await fresh(browser);
  await connect(b, 'login', 'sam', 'password123');
  b.once('dialog', (d) => void d.accept());
  await b.getByRole('button', { name: /Use the server/ }).click();
  await expect(b.getByText('Online, in sync')).toBeVisible();
  await b.goto('/#/players');
  const count = async (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('cricketpro.db.v1')!).players.length as number);
  expect(await count(b)).toBe(snap.players.length);

  await a.goto('/#/players');
  await a.getByLabel('New player name').fill('Zed Live');
  await a.getByLabel('New player name').press('Enter');
  await expect.poll(() => count(b), { timeout: 10000 }).toBe(snap.players.length + 1);
  await expect(b.getByText('Zed Live').first()).toBeVisible();

  // B goes offline, adds a player, comes back: it uploads and A receives it
  await b.context().setOffline(true);
  await b.getByLabel('New player name').fill('Offline Ollie');
  await b.getByLabel('New player name').press('Enter');
  await expect(b.getByText('Offline Ollie').first()).toBeVisible();
  await b.context().setOffline(false);
  await b.goto('/#/settings');
  await b.getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(() => count(a), { timeout: 15000 }).toBe(snap.players.length + 2);

  // viewer cannot upload
  const v = await fresh(browser);
  await connect(v, 'login', 'vera', 'password123');
  v.once('dialog', (d) => void d.accept());
  await v.getByRole('button', { name: /Use the server/ }).click();
  await expect(v.getByText('Online, in sync')).toBeVisible();
  await v.goto('/#/players');
  await v.getByLabel('New player name').fill('Nope');
  await v.getByLabel('New player name').press('Enter');
  await v.goto('/#/settings');
  await expect(v.getByText('read-only', { exact: false }).first()).toBeVisible({ timeout: 10000 });
});
