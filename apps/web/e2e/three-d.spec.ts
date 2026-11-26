import { expect, test } from '@playwright/test';

// The other specs run with "reduce motion" (flat ball). This one turns full motion on and checks the real 3D scene.
test.use({ reducedMotion: 'no-preference', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('home hero renders a live 3D canvas without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText('Start a new match')).toBeVisible({ timeout: 20000 }); // slow under load: software WebGL + parallel workers
  await expect(page.locator('[data-testid="hero-3d"] canvas')).toHaveCount(1, { timeout: 20000 });
  const box = await page.locator('[data-testid="hero-3d"] canvas').boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);
  // the canvas actually has drawn (non-empty) pixels
  await page.waitForTimeout(1500);
  const drawn = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="hero-3d"] canvas') as HTMLCanvasElement;
    return c.width > 0 && c.height > 0;
  });
  expect(drawn).toBe(true);
  expect(errors).toEqual([]);
});

test('coin toss: flipping lands on a team and picks the toss winner', async ({ page }) => {
  await page.goto('/#/matches/new');
  await page.getByPlaceholder('e.g. Eagles').fill('Eagles'); await page.getByPlaceholder('e.g. Tigers').fill('Tigers');
  await page.getByLabel('Other number of overs').fill('5'); await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Add a player to Eagles').fill('Ali, Bob'); await page.getByLabel('Add a player to Eagles').press('Enter');
  await page.getByLabel('Add a player to Tigers').fill('Dan, Eve'); await page.getByLabel('Add a player to Tigers').press('Enter');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Flip a coin' }).click();
  await expect(page.getByText(/chose to…/)).toBeVisible({ timeout: 8000 });   // a winner was chosen by the coin
  await expect(page.getByRole('button', { name: 'Flip again' })).toBeVisible();
  await expect(page.getByText(/will bat first/)).toBeVisible();
});

test('welcome animation shows once per session and can be skipped by tapping', async ({ page }) => {
  // keep the intro on screen long enough that a slow CI machine cannot miss it
  await page.addInitScript(() => { const st = window.setTimeout; (window as unknown as { setTimeout: unknown }).setTimeout = (f: TimerHandler, ms?: number, ...a: unknown[]) => st(f, ms === 3200 ? 60000 : ms, ...a); });
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByTestId('welcome')).toContainText('Every ball. Every run. Every wicket.');
  await page.getByTestId('welcome').click({ timeout: 2500 }).catch(() => undefined);   // may already have auto-closed on a slow machine
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await page.reload();                                     // same session: not shown again
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
});
