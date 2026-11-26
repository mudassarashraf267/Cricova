import { expect, test, type Page } from '@playwright/test';

const SIZES: [string, number, number][] = [
  ['xxsm-320 (iPhone SE 1)', 320, 568], ['xsm-360 (small Android)', 360, 640], ['xsm-375 (iPhone SE/8)', 375, 667], ['xsm-390 (iPhone 14)', 390, 844], ['xsm-412 (Pixel)', 412, 915], ['xsm-430 (Pro Max)', 430, 932],
  ['sm-640 (large phone landscape)', 640, 360], ['sm-600 (small tablet)', 600, 960], ['md-768 (iPad portrait)', 768, 1024], ['md-820 (iPad Air)', 820, 1180],
  ['lg-1024 (iPad landscape / laptop)', 1024, 768], ['lg-1180', 1180, 820], ['xlg-1280 (laptop)', 1280, 800], ['xlg-1440', 1440, 900], ['xxlg-1536', 1536, 864], ['xxlg-1920 (desktop)', 1920, 1080], ['xxlg-2560 (QHD)', 2560, 1440],
];
const ROUTES = ['/', '/matches', '/matches/new', '/matches/m_1', '/players', '/teams', '/tournaments', '/analytics', '/compare', '/settings'];

async function scoringId(page: Page) {
  await page.goto('/#/matches/new');
  await page.getByPlaceholder('e.g. Eagles').fill('Eagles'); await page.getByPlaceholder('e.g. Tigers').fill('Tigers');
  await page.getByLabel('Other number of overs').fill('5'); await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Add a player to Eagles').fill('Ali, Bob'); await page.getByLabel('Add a player to Eagles').press('Enter');
  await page.getByLabel('Add a player to Tigers').fill('Dan, Eve'); await page.getByLabel('Add a player to Tigers').press('Enter');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Eagles', exact: true }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/scoring/);
  return page.url().split('#')[1];
}

// Breakpoints: xxsm 320, xsm 375, sm 640, md 768, lg 1024, xlg 1280, xxlg 1536. Checks every page at 17 device sizes for sideways overflow, clipped text and tiny tap targets.
test('responsive: every page fits every device size', async ({ page }) => {
  test.setTimeout(600000);
  await page.goto('/'); await page.evaluate(() => sessionStorage.setItem('cricova.welcomed', '1'));
  const live = await scoringId(page);
  const problems: string[] = [];
  for (const [name, w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const r of [...ROUTES, live]) {
      await page.goto(`/#${r}`); await page.waitForTimeout(450);
      const res = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth; const out: string[] = [];
        const inScroller = (el: Element) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p !== document.body && p !== document.documentElement && p.id !== 'root') return true; } return false; };
        document.querySelectorAll('body *').forEach((el) => {
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' && (el as HTMLElement).dataset.testid === 'welcome') return;
          const b = el.getBoundingClientRect(); if (b.width === 0 || b.height === 0) return;
          if ((b.right > vw + 1 || b.left < -1) && !inScroller(el) && cs.position !== 'fixed' && !el.closest('svg') && !el.closest('[aria-hidden="true"]')) out.push(`overflow ${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} right=${Math.round(b.right)} vw=${vw}`);
          // clipped text: element with text wider than its box and overflow hidden
          if ((cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && (el.textContent ?? '').trim()) out.push(`clipped text "${(el.textContent ?? '').trim().slice(0, 30)}"`);
        });
        if (vw <= 768) document.querySelectorAll('button, a.btn, [role=tab], input:not([type=checkbox]):not([type=range]), select').forEach((el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (cs.display === 'none' || b.width === 0) return; if (b.height < 30) out.push(`small tap target ${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" h=${Math.round(b.height)}`); });
        return [...new Set(out)].slice(0, 8);
      });
      for (const p of res) problems.push(`${name} ${r}: ${p}`);
    }
  }
  expect(problems).toEqual([]);
});
