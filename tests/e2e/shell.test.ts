import { readFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { launch, openApp, penTapButton } from './pen';

/**
 * The app around the editor: getting from one screen to another, by tab, by
 * address and by the back gesture, and what a play's card can do.
 */
let browser: Browser;
let page: Page;
let close: () => Promise<void>;

const fixture = () => {
  const b = JSON.parse(readFileSync('tests/fixtures/backup-v1.json', 'utf8'));
  return { plays: b.plays, sections: b.sections, uid: null };
};
const stored = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('chalk.playbook.v1') ?? '{"plays":[]}')) as Promise<{
    plays: { id: string; name: string; sectionId: string; deletedAt?: number }[];
  }>;
const path = () => page.evaluate(() => location.pathname);
const title = () => page.locator('.page-head h1').innerText();
const tab = (name: string) => page.getByRole('navigation').getByRole('link', { name });

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});
beforeEach(async () => {
  const opened = await openApp(browser, { width: 412, height: 915, book: fixture() });
  page = opened.page;
  close = () => opened.context.close();
  await page.locator('.page-head').waitFor();
});
afterEach(async () => {
  await close();
});

describe('getting around', () => {
  it('opens each place from its tab, and gives it an address', async () => {
    for (const [name, at] of [['Team', '/team'], ['Print', '/print'], ['Settings', '/settings'], ['Playbook', '/']] as const) {
      await tab(name).click();
      expect(await title()).toBe(name);
      expect(await path()).toBe(at);
      expect(await tab(name).getAttribute('aria-current')).toBe('page');
    }
  });

  it('answers a light pen tap on a tab, once', async () => {
    // A link waits for a synthesized click exactly as a button does.
    const box = (await tab('Team').boundingBox())!;
    await page.evaluate(async ({ x, y }) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 4; i++) {
        const el = document.elementFromPoint(x, y)!;
        for (const type of ['pointerdown', 'pointerup']) {
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'pen', clientX: x, clientY: y }));
          await sleep(4);
        }
        await sleep(14);
      }
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect.poll(title).toBe('Team');
  });

  it('comes back to the playbook on the back gesture, and stays in the app', async () => {
    await tab('Settings').click();
    await page.goBack();
    await expect.poll(title).toBe('Playbook');
    expect(await path()).toBe('/');
  });

  it('opens a play from its card, and the back gesture closes it', async () => {
    await page.getByRole('button', { name: /^Open / }).first().click();
    await page.locator('.stage svg').waitFor();
    expect(await path()).toBe('/play/sweep');
    await page.goBack();
    await page.locator('.page-head').waitFor();
    expect(await path()).toBe('/');
  });

  it('lands on the play its address names', async () => {
    await page.goto(process.env.CHALK_URL + 'play/cover3');
    await page.locator('.stage svg').waitFor();
    expect(await path()).toBe('/play/cover3');
    await page.getByRole('button', { name: 'Back to playbook' }).click();
    await expect.poll(title).toBe('Playbook');
  });

  it('lands on the playbook for a play that is not in this book', async () => {
    await page.goto(process.env.CHALK_URL + 'play/never-existed');
    await page.locator('.page-head').waitFor();
    await expect.poll(path).toBe('/');
  });

  it('has no navigation inside the editor, where it would sit beside the board', async () => {
    await page.getByRole('button', { name: 'New play', exact: true }).click();
    await page.locator('.stage svg').waitFor();
    expect(await page.getByRole('navigation').count()).toBe(0);
  });
});

describe('a play card', () => {
  const menu = (play: string) => page.getByRole('button', { name: `More for ${play}` });

  it('keeps its tools behind one button, and duplicates from there', async () => {
    await menu('26 All the way right').click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    expect((await stored()).plays.filter((p) => !p.deletedAt)).toHaveLength(3);
    expect(await page.getByRole('menu').count()).toBe(0);
  });

  it('opens the same menu under a pen burst, and only once', async () => {
    await penTapButton(page, 'More for Cover 3', 5);
    expect(await page.getByRole('menu').count()).toBe(1);
  });

  /*
   * The menu shuts and the confirm opens in the same breath, which is one back
   * layer closing as another opens. That used to leave the app thinking it had
   * a spare history entry it did not, and confirming walked out of the app.
   */
  it('deletes through a confirm, into the trash', async () => {
    await menu('Cover 3').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    const gone = (await stored()).plays.find((p) => p.id === 'cover3')!;
    expect(gone.deletedAt).toBeGreaterThan(0);
    await expect.poll(() => page.getByRole('button', { name: /^Deleted \(/ }).count()).toBe(1);
    expect(await path()).toBe('/');
    // And the app is still one back gesture from closing, not zero or two.
    expect(await page.evaluate(() => history.state)).toBeNull();
  });

  it('files a play in a folder from the menu', async () => {
    await menu('Cover 3').click();
    await page.getByLabel('Folder for Cover 3').selectOption({ label: 'Run game' });
    expect((await stored()).plays.find((p) => p.id === 'cover3')!.sectionId).toBe('s1');
  });

  it('closes the menu on a tap elsewhere and on the back gesture', async () => {
    await menu('Cover 3').click();
    await page.locator('.page-head h1').click();
    expect(await page.getByRole('menu').count()).toBe(0);
    await menu('Cover 3').click();
    await page.goBack();
    await expect.poll(() => page.getByRole('menu').count()).toBe(0);
    expect(await title()).toBe('Playbook');
  });
});

describe('the themes', () => {
  it('changes the chrome and leaves the board on grass', async () => {
    const colors = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return { bg: cs.getPropertyValue('--bg').trim(), turf: cs.getPropertyValue('--turf').trim() };
      });
    const dark = await colors();
    await tab('Settings').click();
    await page.locator('.setting', { hasText: 'Theme' }).getByRole('button', { name: 'Light', exact: true }).click();
    const light = await colors();
    expect(light.bg).not.toBe(dark.bg);
    expect(light.turf).toBe(dark.turf);
    await page.reload();
    await page.locator('.page-head').waitFor();
    expect((await colors()).bg).toBe(light.bg);
  });
});
