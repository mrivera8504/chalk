import { mkdirSync, readFileSync } from 'node:fs';
import { it } from 'vitest';
import { launch, man, onBoard, openApp, penTap, savedPlay } from './pen';

/**
 * Pictures of every screen, for looking at — not a test of anything.
 *
 * Skipped unless SHOT_DIR says where to put them:
 *
 *     SHOT_DIR=/tmp/shots npm run test:e2e -- shots
 *
 * The book is the version 1 backup fixture with a few more plays filed around
 * it, so the screens are full enough to judge.
 */
const out = process.env.SHOT_DIR;
const theme = process.env.SHOT_THEME; // 'light' | 'dark' | unset for the device's own

function book() {
  const b = JSON.parse(readFileSync('tests/fixtures/backup-v1.json', 'utf8'));
  const names = ['Jet Sweep', 'Twins Slant', 'Power Right', 'Bootleg', 'Counter Trey'];
  const more = names.map((name, i) => ({
    ...b.plays[i % 2],
    id: `x${i}`,
    name,
    sectionId: i < 3 ? 's1' : 'unfiled',
    updatedAt: b.plays[0].updatedAt + i,
  }));
  return { plays: [...b.plays, ...more], sections: [...b.sections, { id: 's2', name: 'Pass game', order: 2 }], uid: null };
}

it.skipIf(!out)('shots', async () => {
  mkdirSync(out!, { recursive: true });
  const browser = await launch();
  for (const [w, h, tag] of [[412, 915, 'phone'], [1280, 800, 'tablet']] as const) {
    const { page, context } = await openApp(browser, {
      width: w,
      height: h,
      book: book(),
      theme,
      // Shut on a phone, where it would cover the man the pen is about to tap.
      drawer: tag === 'phone' ? 'closed' : 'open',
    });
    const shot = async (name: string, fullPage = false) => {
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage });
    };
    await shot('1-book');
    await shot('1-book-full', true);
    for (const [label, name] of [['Team', '2-team'], ['Print', '3-print'], ['Settings', '4-settings']] as const) {
      const tab = page.getByRole('navigation').getByRole('link', { name: label });
      if (await tab.count()) {
        await tab.click();
        await shot(name);
      }
    }
    const home = page.getByRole('navigation').getByRole('link', { name: 'Playbook' });
    if (await home.count()) await home.click();
    await page.getByRole('button', { name: 'New play', exact: true }).click();
    await page.locator('.stage svg').waitFor();
    await shot('5-editor');
    const te = man(await savedPlay(page, -1), 'TE');
    await onBoard(page, te);
    await penTap(page, te);
    await shot('6-routes');
    await page.locator('.inspector button').filter({ hasText: /^Medium out$/ }).first().click();
    await shot('7-route-set');
    if (tag === 'phone') {
      await page.getByRole('button', { name: 'Show the tools' }).click();
      await shot('8-tools');
    }
    await context.close();
  }
  await browser.close();
}, 120_000);
