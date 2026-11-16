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
    await page.locator('.stage > svg').waitFor();
    expect(await path()).toBe('/play/sweep');
    await page.goBack();
    await page.locator('.page-head').waitFor();
    expect(await path()).toBe('/');
  });

  it('lands on the play its address names', async () => {
    await page.goto(process.env.CHALK_URL + 'play/cover3');
    await page.locator('.stage > svg').waitFor();
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
    await page.locator('.stage > svg').waitFor();
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

  it('deletes without asking, into the trash, and offers the way back', async () => {
    await menu('Cover 3').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    expect(await page.getByRole('dialog').count()).toBe(0);
    expect((await stored()).plays.find((p) => p.id === 'cover3')!.deletedAt).toBeGreaterThan(0);
    // The fixture already has one play in the trash; this makes two.
    const trash = () => page.getByRole('button', { name: /^Deleted \(/ }).innerText();
    await expect.poll(trash).toBe('Deleted (2)');

    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
    expect((await stored()).plays.find((p) => p.id === 'cover3')!.deletedAt).toBeUndefined();
    await expect.poll(trash).toBe('Deleted (1)');
  });

  it('takes the Undo under a pen burst, once', async () => {
    await menu('Cover 3').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await penTapButton(page, 'Undo', 5);
    expect((await stored()).plays.filter((p) => !p.deletedAt)).toHaveLength(2);
  });

  /*
   * A folder's menu shuts and its confirm opens in the same breath, which is
   * one back layer closing as another opens. That used to leave the app
   * thinking it had a spare history entry it did not, and answering the
   * question walked out of the app.
   */
  it('raises a confirm from a menu without losing its place in history', async () => {
    await page.getByRole('button', { name: 'More for the folder Run game' }).click();
    await page.getByRole('menuitem', { name: 'Delete folder' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete folder' }).click();
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    expect(await title()).toBe('Playbook');
    expect(await path()).toBe('/');
    // And the app is still one back gesture from closing, not zero or two.
    expect(await page.evaluate(() => history.state)).toBeNull();
    expect(await page.getByRole('button', { name: 'More for the folder Run game' }).count()).toBe(0);
  });

  it('shows a play\'s earlier versions, and says so when there are none yet', async () => {
    await menu('Cover 3').click();
    await page.getByRole('menuitem', { name: 'Earlier versions' }).click();
    const dialog = page.getByRole('dialog', { name: 'Earlier versions of Cover 3' });
    await expect.poll(() => dialog.innerText()).toContain('None kept yet');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
  });

  it('files a play in a folder from the menu', async () => {
    await menu('Cover 3').click();
    await page.getByLabel('Folder for Cover 3').selectOption({ label: 'Run game' });
    expect((await stored()).plays.find((p) => p.id === 'cover3')!.sectionId).toBe('s1');
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
    expect((await stored()).plays.find((p) => p.id === 'cover3')!.sectionId).not.toBe('s1');
  });

  it('closes the menu on a tap elsewhere and on the back gesture', async () => {
    await menu('Cover 3').click();
    // Not the title: that is the playbook switcher now, and opens a menu of its own.
    await page.locator('.page-head p').click();
    expect(await page.getByRole('menu').count()).toBe(0);
    await menu('Cover 3').click();
    await page.goBack();
    await expect.poll(() => page.getByRole('menu').count()).toBe(0);
    expect(await title()).toBe('Playbook');
  });
});

describe('playbooks', () => {
  const switcher = () => page.getByRole('button', { name: 'Change playbook' });
  const ask = async (text: string, confirm: string, kind = '7-man') => {
    await page.getByRole('dialog').getByRole('textbox').fill(text);
    await page.getByRole('dialog').getByRole('button', { name: confirm }).click();
    // A new playbook is asked what kind of football it is, straight after.
    await page.getByRole('dialog', { name: 'What is this playbook for?' }).getByRole('button', { name: kind }).click();
  };
  const men = async (side: string) => {
    const made = (await stored()).plays.find((x) => !['sweep', 'cover3', 'oldest'].includes(x.id));
    const play = made as unknown as { variant?: string; players: { side: string }[] };
    return { variant: play.variant, count: play.players.filter((m) => m.side === side).length };
  };

  it('adds a second one, empty, and switches back to the first with its plays intact', async () => {
    await switcher().click();
    await page.getByRole('menuitem', { name: 'New playbook' }).click();
    await ask('JV offense', 'Add playbook');
    await expect.poll(title).toBe('JV offense');
    expect(await page.locator('.play-card').count()).toBe(0);

    await switcher().click();
    await page.getByRole('menuitemradio', { name: 'Playbook', exact: true }).click();
    await expect.poll(title).toBe('Playbook');
    expect(await page.locator('.play-card').count()).toBe(2);
  });

  it('starts a new play in the playbook that is open', async () => {
    await switcher().click();
    await page.getByRole('menuitem', { name: 'New playbook' }).click();
    await ask('JV', 'Add playbook');
    await page.getByRole('button', { name: 'New play', exact: true }).click();
    await page.locator('.stage > svg').waitFor();
    await page.getByRole('button', { name: 'Back to playbook' }).click();
    await expect.poll(title).toBe('JV');
    expect(await page.locator('.play-card').count()).toBe(1);
    const made = (await stored()).plays.find((x) => !['sweep', 'cover3', 'oldest'].includes(x.id));
    expect((made as unknown as { bookId?: string }).bookId).toBeTruthy();
  });

  it('opens an eleven-man playbook with eleven on the field, blocks and all', async () => {
    await switcher().click();
    await page.getByRole('menuitem', { name: 'New playbook' }).click();
    await ask('Varsity', 'Add playbook', '11-man');
    await page.getByRole('button', { name: 'New play', exact: true }).click();
    await page.locator('.stage > svg').waitFor();
    expect(await men('offense')).toEqual({ variant: 'eleven', count: 11 });
    await expect.poll(() => page.locator('.legality').first().innerText()).toMatch(/7/);
    expect(await page.getByRole('button', { name: 'Block', exact: true }).count()).toBe(1);
  });

  it('opens a flag playbook five a side, with nothing to block with', async () => {
    await switcher().click();
    await page.getByRole('menuitem', { name: 'New playbook' }).click();
    await ask('Flag', 'Add playbook', '5v5 flag');
    await page.getByRole('button', { name: 'New defense', exact: true }).click();
    await page.locator('.stage > svg').waitFor();
    expect(await men('defense')).toEqual({ variant: 'flag5', count: 5 });
    expect((await men('offense')).count).toBe(5);
    for (const gone of ['Block', 'Pull', 'Combo', 'Stunt']) {
      expect(await page.getByRole('button', { name: gone, exact: true }).count(), gone).toBe(0);
    }
    expect(await page.getByRole('button', { name: 'Man', exact: true }).count()).toBe(1);
  });

  it('leaves the plays already drawn alone when a playbook changes kind', async () => {
    await switcher().click();
    await page.getByRole('menuitem', { name: /7-man football/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '8-man' }).click();
    const before = (await stored()).plays.filter((x) => ['sweep', 'cover3', 'oldest'].includes(x.id));
    expect(before.every((x) => !('variant' in x))).toBe(true);
    await page.getByRole('button', { name: 'New play', exact: true }).click();
    await page.locator('.stage > svg').waitFor();
    expect(await men('offense')).toEqual({ variant: 'eight', count: 8 });
  });

  it('marks where the team is with a play, and filters by it', async () => {
    await page.getByRole('button', { name: 'More for Cover 3' }).click();
    await page.getByLabel('Status of Cover 3').selectOption({ label: 'Game-ready' });
    await expect.poll(() => page.locator('.status-tag').innerText()).toBe('Game-ready');
    await page.getByLabel('Filter by status').selectOption({ label: 'Game-ready' });
    expect(await page.locator('.play-card').count()).toBe(1);
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

describe('the first screen', () => {
  const fresh = async () => {
    await close();
    const opened = await openApp(browser, { width: 412, height: 915, welcome: true });
    page = opened.page;
    close = () => opened.context.close();
  };

  it('asks a device with nothing on it what it coaches, once', async () => {
    await fresh();
    await page.getByRole('radio', { name: /6-man/ }).click();
    await page.getByRole('button', { name: 'Start my playbook' }).click();
    await page.locator('.page-head').waitFor();
    await page.getByRole('button', { name: 'New play', exact: true }).click();
    await page.locator('.stage > svg').waitFor();
    const play = (await stored()).plays[0] as unknown as { variant?: string; players: unknown[] };
    expect([play.variant, play.players.length]).toEqual(['six', 6]);
    expect(await page.evaluate(() => localStorage.getItem('chalk.welcomed.v1'))).toBeTruthy();
  });

  it('answers a light pen tap, and seven-man stores nothing', async () => {
    await fresh();
    await penTapButton(page, 'Start my playbook');
    await page.locator('.page-head').waitFor();
    const book = await page.evaluate(() => JSON.parse(localStorage.getItem('chalk.playbook.v1') ?? '{}'));
    expect(book.books ?? []).toEqual([]);
  });

  it('never shows to a device that already has a book', async () => {
    await close();
    const opened = await openApp(browser, { width: 412, height: 915, welcome: true, book: fixture() });
    page = opened.page;
    close = () => opened.context.close();
    await page.locator('.page-head').waitFor();
    expect(await page.locator('.welcome').count()).toBe(0);
    expect(await page.locator('.play-card').count()).toBe(2);
  });
});
