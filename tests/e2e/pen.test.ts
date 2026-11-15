import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fingerDrag, launch, man, openApp, penHover, penTap, penTapButton, savedPlay } from './pen';

let browser: Browser;
let page: Page;
let close: () => Promise<void>;

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

/** A new offensive play, open in the editor: the shipped 7-man set, in Routes. */
beforeEach(async () => {
  const opened = await openApp(browser);
  page = opened.page;
  close = () => opened.context.close();
  await page.getByRole('button', { name: 'New play', exact: true }).click();
  await page.locator('.stage svg').waitFor();
});
afterEach(async () => {
  await close();
});

/**
 * Nobody gets from a button to the board in under a fifth of a second, and the
 * editor counts anything sooner as the bounce of the tap that pressed it.
 */
const settle = () => page.waitForTimeout(200);
const move = async () => {
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await settle();
};
const steps = async () => ({
  back: await page.getByRole('button', { name: 'Step back' }).isEnabled(),
});
const stepBack = async () => {
  await settle();
  await page.getByRole('button', { name: 'Step back' }).click();
};

describe('picking a man with the pen', () => {
  it('selects him from a five-pair burst landing off his center, and leaves him where he is', async () => {
    const before = man(await savedPlay(page), 'RG');
    // 0.5 yards off: inside his 0.72yd mark, the taps the trace showed missing.
    await penTap(page, { x: before.x + 0.3, y: before.y + 0.4 });
    await expect.poll(() => page.locator('.inspector').count()).toBeGreaterThan(0);
    const after = man(await savedPlay(page), 'RG');
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });

  it('does not move him in Routes however the pen travels afterwards', async () => {
    const before = man(await savedPlay(page), 'TE');
    await penTap(page, before);
    await penHover(page, before, { x: -6, y: -8 });
    await penTap(page, { x: -6, y: -8 });
    const after = man(await savedPlay(page), 'TE');
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });
});

describe('moving a man: tap, travel, tap', () => {
  it('carries him under a hovering pen and sets him down on the second tap', async () => {
    await move();
    const rb = man(await savedPlay(page), 'RB');
    await penTap(page, rb);
    await penHover(page, rb, { x: 4, y: 6 });
    await penTap(page, { x: 4, y: 6 });
    const placed = man(await savedPlay(page), 'RB');
    expect(placed.x).toBeCloseTo(4, 0);
    expect(placed.y).toBeCloseTo(6, 0);
  });

  it('does not pick him back up on the bounce of the tap that set him down', async () => {
    await move();
    const rb = man(await savedPlay(page), 'RB');
    await penTap(page, rb);
    await penHover(page, rb, { x: 4, y: 6 });
    await penTap(page, { x: 4, y: 6 }, 5);
    const placed = man(await savedPlay(page), 'RB');
    // The pen wanders off. If a bounce had re-grabbed him he would follow.
    await penHover(page, { x: 4, y: 6 }, { x: -7, y: 8 });
    const later = man(await savedPlay(page), 'RB');
    expect([later.x, later.y]).toEqual([placed.x, placed.y]);
  });

  it('is one step of undo, however many contacts it arrived as', async () => {
    await move();
    const rb = man(await savedPlay(page), 'RB');
    expect((await steps()).back).toBe(false);
    await penTap(page, rb);
    await penHover(page, rb, { x: 4, y: 6 }, 30);
    await penTap(page, { x: 4, y: 6 });
    await stepBack();
    await expect.poll(async () => { const m = man(await savedPlay(page), 'RB'); return [m.x, m.y]; }).toEqual([rb.x, rb.y]);
    // The whole drag was that one step: there is nothing left to step back over.
    expect((await steps()).back).toBe(false);
  });

  it('snaps an offensive man onto the line when he is set down near it', async () => {
    await move();
    const wb = man(await savedPlay(page), 'WB');
    await penTap(page, wb);
    await penHover(page, wb, { x: -5, y: 0.3 });
    await penTap(page, { x: -5, y: 0.3 });
    const placed = man(await savedPlay(page), 'WB');
    expect(placed.y).toBe(0);
    expect((placed as unknown as { onLine: boolean }).onLine).toBe(true);
  });
});

/*
 * Where the grammar's own limit is, written down rather than argued about.
 *
 * The editor treats a contact within 120ms (CHATTER_MS) of the lift that picked
 * a man up as the bounce of that tap. The device notes record one press as up
 * to five pairs within 150ms. Those two numbers overlap by 30ms: a press whose
 * last pair lands in that tail reads as the second tap, and the man is set down
 * where he was picked up. Whether the pen really produces such a tail is a
 * question for a device trace, not for this file — these two tests only pin
 * what the code does on either side of the line.
 */
describe('the edge of the bounce window', () => {
  const carrying = () => page.getByRole('button', { name: /^Place / }).count();

  it('holds a man through a five-pair press that is over inside 100ms', async () => {
    await move();
    // 5ms of contact, 18ms apart: the last pair lands about 90ms after the first lift.
    await penTap(page, man(await savedPlay(page), 'RB'), 5, { contact: 5, gap: 18 });
    expect(await carrying()).toBe(1);
  });

  it('sets him straight back down when the press runs to 150ms', async () => {
    await move();
    // The same press at 31ms apart: the last pair lands about 140ms after it.
    await penTap(page, man(await savedPlay(page), 'RB'), 5, { contact: 5, gap: 31 });
    expect(await carrying()).toBe(0);
  });
});

describe('a finger', () => {
  it('drags a man by holding contact, and that is one step of undo too', async () => {
    await move();
    const rb = man(await savedPlay(page), 'RB');
    await fingerDrag(page, rb, { x: -4, y: 7 });
    const placed = man(await savedPlay(page), 'RB');
    expect(placed.x).toBeCloseTo(-4, 0);
    expect(placed.y).toBeCloseTo(7, 0);
    await stepBack();
    await expect.poll(async () => { const m = man(await savedPlay(page), 'RB'); return [m.x, m.y]; }).toEqual([rb.x, rb.y]);
    expect((await steps()).back).toBe(false);
  });
});

describe('buttons under a light pen tap', () => {
  it('clicks once when the browser fires no click of its own', async () => {
    const holes = page.getByRole('button', { name: 'Hole numbers' });
    const was = await holes.getAttribute('aria-pressed');
    await penTapButton(page, 'Hole numbers', 1);
    expect(await holes.getAttribute('aria-pressed')).not.toBe(was);
  });

  it('clicks once, not four times, for a four-pair bounce', async () => {
    const holes = page.getByRole('button', { name: 'Hole numbers' });
    const was = await holes.getAttribute('aria-pressed');
    await penTapButton(page, 'Hole numbers', 4);
    // An even number of clicks would have put it back.
    expect(await holes.getAttribute('aria-pressed')).not.toBe(was);
  });

  it('opens exactly one dialog from a bounce burst, and a burst on Cancel changes nothing', async () => {
    await move();
    const rb = man(await savedPlay(page), 'RB');
    await fingerDrag(page, rb, { x: -4, y: 7 });
    await penTapButton(page, 'Start this play over', 5);
    await expect.poll(() => page.getByRole('dialog').count()).toBe(1);
    await penTapButton(page, 'Cancel', 5);
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    expect(man(await savedPlay(page), 'RB').x).toBeCloseTo(-4, 0);
  });
});

describe('freehand: tap, draw in the air, tap', () => {
  const pencil = async () => {
    await page.getByRole('button', { name: 'Draw freehand' }).click();
    await settle();
  };
  const ink = async () => {
    const p = await savedPlay(page);
    return { annotations: p.annotations.length as number, lines: p.assignments.length as number };
  };

  it('makes one stroke from a start tap, hover travel and a finishing tap', async () => {
    await pencil();
    await penTap(page, { x: -8, y: -12 });
    await page.waitForTimeout(140); // a real second tap is never inside the chatter window
    await penHover(page, { x: -8, y: -12 }, { x: -3, y: -16 }, 20);
    await penTap(page, { x: -3, y: -16 });
    await expect.poll(async () => (await ink()).annotations).toBe(1);
  });

  it('is not ended by the bounce of the tap that started it', async () => {
    await pencil();
    await penTap(page, { x: -8, y: -12 }, 5);
    expect((await ink()).annotations).toBe(0);
  });

  it('gives a stroke started on a man to that man, as his route', async () => {
    await pencil();
    const te = man(await savedPlay(page), 'TE');
    await penTap(page, te);
    await page.waitForTimeout(140);
    await penHover(page, te, { x: te.x + 4, y: -8 }, 20);
    await penTap(page, { x: te.x + 4, y: -8 });
    await expect.poll(async () => (await ink()).lines).toBe(1);
    const p = await savedPlay(page);
    expect(p.assignments[0].playerId).toBe(te.id);
  });
});

describe('the board does not move under the hand', () => {
  it('is the same box with the drawer open and shut', async () => {
    const box = () => page.locator('.stage').boundingBox();
    const open = await box();
    await page.getByRole('button', { name: 'Hide the tools' }).click();
    await page.waitForTimeout(400);
    expect(await box()).toEqual(open);
  });

  it('is the same box with a man selected and the inspector up', async () => {
    const box = () => page.locator('.stage').boundingBox();
    const bare = await box();
    await penTap(page, man(await savedPlay(page), 'RG'));
    await page.locator('.inspector').first().waitFor();
    expect(await box()).toEqual(bare);
  });
});

describe('sliding the board', () => {
  it('moves the window, saves nothing and costs no undo', async () => {
    const before = JSON.stringify((await savedPlay(page)).players);
    const viewBox = () => page.locator('.stage svg').getAttribute('viewBox');
    const was = await viewBox();
    await page.getByRole('button', { name: 'Move the board' }).click();
    await settle();
    await penTap(page, { x: 0, y: -5 });
    await penHover(page, { x: 0, y: -5 }, { x: 5, y: -5 });
    await penTap(page, { x: 5, y: -5 });
    expect(await viewBox()).not.toBe(was);
    expect(JSON.stringify((await savedPlay(page)).players)).toBe(before);
    expect((await steps()).back).toBe(false);
  });
});
