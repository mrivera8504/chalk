import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fingerDrag, launch, onBoard, openApp, penHover, penTap, savedPlay, type Yd } from './pen';

/**
 * Every tool the board has, once each, through the pen.
 *
 * Written before the pointer handlers were split up per tool, as the thing the
 * split is checked against: each test here goes down a different branch of
 * what used to be one 330-line `handleStageDown`.
 */
let browser: Browser;
let page: Page;
let close: () => Promise<void>;

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});
beforeEach(async () => {
  const opened = await openApp(browser);
  page = opened.page;
  close = () => opened.context.close();
  await page.getByRole('button', { name: 'New play', exact: true }).click();
  await page.locator('.stage svg').waitFor();
  await settle();
});
afterEach(async () => {
  await close();
});

const settle = () => page.waitForTimeout(200);
/** A spot nothing is ever drawn on and no panel covers. */
const GRASS: Yd = { x: 9, y: -18 };
const press = async (name: string | RegExp, scope = 'body') => {
  await page.locator(scope).getByRole('button', { name, exact: typeof name === 'string' }).first().click();
  await settle();
};
/** A button in the man's own panel, by the words on it rather than its aria-label. */
const pick = async (text: string) => {
  await page.locator('.inspector button').filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
  await settle();
};
const play = () => savedPlay(page);
const who = async (label: string, side = 'offense') =>
  (await play()).players.find((p: { label: string; side: string }) => p.label === label && p.side === side) as Yd & { id: string };
const tap = async (at: Yd) => {
  await onBoard(page, at);
  await penTap(page, at);
  await settle();
};
/** Tap, travel off the glass, tap: the whole grammar in one line. */
const carry = async (from: Yd, to: Yd) => {
  await onBoard(page, from);
  await onBoard(page, to);
  await penTap(page, from);
  await page.waitForTimeout(140);
  await penHover(page, from, to, 16);
  await penTap(page, to);
  await settle();
};
const canStepBack = () => page.getByRole('button', { name: 'Step back' }).isEnabled();
const stepBack = () => press('Step back');

describe('routes', () => {
  it('gives the man in hand a route, and takes it back off on a second tap', async () => {
    const te = await who('TE');
    await tap(te);
    await pick('Medium out');
    let p = await play();
    expect(p.assignments).toHaveLength(1);
    expect(p.assignments[0]).toMatchObject({ playerId: te.id, preset: 'out' });
    await pick('Medium out');
    p = await play();
    expect(p.assignments).toHaveLength(0);
  });

  it('overrides his route with the next one picked', async () => {
    await tap(await who('TE'));
    await pick('Medium out');
    await pick('Slant');
    const p = await play();
    expect(p.assignments.map((a: { preset: string }) => a.preset)).toEqual(['slant']);
  });

  it('opens the man when his own route is tapped, rather than clearing him', async () => {
    const te = await who('TE');
    await tap(te);
    await pick('Go');
    await tap(GRASS); // nobody in hand
    expect(await page.locator('.inspector').count()).toBe(0);
    const line = (await play()).assignments[0].path;
    await tap({ x: line[1].x, y: line[1].y + 2 }); // on the stem, well clear of his mark
    await expect.poll(() => page.locator('.inspector').count()).toBe(1);
  });

  it('runs a route deeper by its end handle, as one step of undo', async () => {
    const te = await who('TE');
    await tap(te);
    await pick('Medium out');
    const before = (await play()).assignments[0];
    const end = before.path[before.path.length - 1];
    await carry(end, { x: end.x, y: end.y - 4 });
    const after = (await play()).assignments[0];
    expect(after.edited).toBe(true);
    expect(after.path[after.path.length - 1].y).toBeCloseTo(end.y - 4, 0);
    expect(after.path.map((q: Yd) => q.x)).toEqual(before.path.map((q: Yd) => q.x));
    expect(after.path[0]).toEqual(before.path[0]);
    await stepBack(); // the drag
    expect((await play()).assignments[0].path).toEqual(before.path);
  });

  it('stars the carrier, and flips one run without touching anyone else', async () => {
    const rb = await who('RB');
    await tap(rb);
    await pick('Sweep');
    await pick('★ Ball');
    let p = await play();
    expect(p.ballCarrierId).toBe(rb.id);
    const hand = p.assignments[0].hand;
    await pick('Flip');
    p = await play();
    expect(p.assignments[0].hand).not.toBe(hand);
    expect(p.assignments[0].preset).toBe('sweep');
  });
});

describe('blocks: tap the blocker, tap his man', () => {
  beforeEach(async () => {
    await press('+ Defense');
  });

  it('draws a block stored as who-blocks-whom', async () => {
    await press('Block');
    const rg = await who('RG');
    const t = (await play()).players.filter((x: { side: string; label: string; x: number }) => x.side === 'defense' && x.label === 'T' && x.x > 0)[0];
    await tap(rg);
    await tap(t);
    const p = await play();
    expect(p.assignments).toHaveLength(1);
    expect(p.assignments[0]).toMatchObject({ kind: 'block', playerId: rg.id, targetPlayerId: t.id });
  });

  it('is not finished by the bounce of the first tap', async () => {
    await press('Block');
    await penTap(page, await who('RG'), 5);
    await settle();
    expect((await play()).assignments).toHaveLength(0);
  });

  it('follows the defender when he is dragged', async () => {
    await press('Block');
    const rg = await who('RG');
    const t = (await play()).players.filter((x: { side: string; label: string; x: number }) => x.side === 'defense' && x.label === 'T' && x.x > 0)[0];
    await tap(rg);
    await tap(t);
    await press('Move');
    await fingerDrag(page, t, { x: 6, y: -3 });
    await settle();
    const p = await play();
    expect(p.assignments[0].targetPlayerId).toBe(t.id);
    expect(p.players.find((x: { id: string }) => x.id === t.id).x).toBeCloseTo(6, 0);
  });

  it('picks the line itself in Move, everywhere it is not under a man', async () => {
    await press('Pull');
    const lg = await who('LG');
    const e = (await play()).players.filter((x: { side: string; label: string; x: number }) => x.side === 'defense' && x.label === 'E' && x.x > 0)[0];
    await tap(lg);
    await tap(e);
    await press('Move');
    // A pull runs behind the line; a yard and a half back, between the guards.
    await tap({ x: 0.9, y: 1.5 });
    await expect.poll(() => page.locator('.inspector').getByRole('button', { name: 'Delete' }).count()).toBe(1);
    await pick('Delete');
    expect((await play()).assignments).toHaveLength(0);
  });
});

describe('the eraser', () => {
  it('rubs out a route whole under a hovering pen, as one step of undo', async () => {
    const te = await who('TE');
    await tap(te);
    await pick('Go');
    const line = (await play()).assignments[0].path;
    const mid = { x: line[1].x, y: (line[0].y + line[line.length - 1].y) / 2 };
    await press('Erase');
    await penTap(page, { x: mid.x - 4, y: mid.y });
    await page.waitForTimeout(140);
    await penHover(page, { x: mid.x - 4, y: mid.y }, { x: mid.x + 3, y: mid.y }, 20);
    await penTap(page, { x: mid.x + 3, y: mid.y });
    await settle();
    expect((await play()).assignments).toHaveLength(0);
    await stepBack();
    expect((await play()).assignments).toHaveLength(1);
  });

  it('does nothing to a line the pen never reaches', async () => {
    await tap(await who('TE'));
    await pick('Go');
    await press('Erase');
    await carry({ x: -9, y: -16 }, { x: -6, y: -18 });
    expect((await play()).assignments).toHaveLength(1);
  });
});

describe('the defense', () => {
  const start = async () => {
    await close();
    const opened = await openApp(browser);
    page = opened.page;
    close = () => opened.context.close();
    await page.getByRole('button', { name: 'New defense', exact: true }).click();
    await page.locator('.stage svg').waitFor();
    await settle();
  };

  it('gives a man a zone, then moves it and sizes it without moving him', async () => {
    await start();
    const s = await who('M', 'defense');
    await tap(s);
    await pick('Middle');
    let z = (await play()).zones[0];
    expect(z.playerId).toBe(s.id);

    await tap(GRASS); // let go of him
    const inside = { x: z.x, y: z.y + z.h * 0.2 };
    await carry(inside, { x: inside.x + 3, y: inside.y });
    const moved = (await play()).zones[0];
    expect(moved.x).toBeCloseTo(z.x + 3, 0);
    expect([moved.w, moved.h]).toEqual([z.w, z.h]);
    const still = await who('M', 'defense');
    expect([still.x, still.y]).toEqual([s.x, s.y]);
    z = moved;
  });

  it('sends a blitzer at a gap and takes his zone away', async () => {
    await start();
    const w = await who('W', 'defense');
    await tap(w);
    // 'Spot', because Hook, Curl and Flat are each on two buttons: a drop and a zone.
    await pick('Spot');
    expect((await play()).zones).toHaveLength(1);
    await pick('A gap');
    const p = await play();
    expect(p.zones ?? []).toHaveLength(0);
    expect(p.assignments.filter((a: { kind: string }) => a.kind === 'blitz')).toHaveLength(1);
  });

  it('mans a defender up on a receiver with two taps', async () => {
    await start();
    await press('Man');
    const m = await who('M', 'defense');
    const te = await who('TE');
    await tap(m);
    await tap(te);
    const p = await play();
    expect(p.assignments).toHaveLength(1);
    expect(p.assignments[0]).toMatchObject({ kind: 'cover', playerId: m.id, targetPlayerId: te.id });
  });
});

describe('the highlights', () => {
  it('swings the cone from its own wash, in Routes, and moves nobody', async () => {
    const qb = await who('QB');
    await tap(qb);
    await pick('Vision');
    const v = (await play()).vision as Yd;
    expect(v).toBeTruthy();
    await tap(GRASS);
    // Two thirds of the way from him to where he is looking: inside the wash.
    const grip = { x: qb.x + (v.x - qb.x) * 0.66, y: qb.y + (v.y - qb.y) * 0.66 };
    await carry(grip, { x: grip.x + 5, y: grip.y });
    const swung = (await play()).vision as Yd;
    expect(swung.x).toBeGreaterThan(v.x + 3);
    const still = await who('QB');
    expect([still.x, still.y]).toEqual([qb.x, qb.y]);
  });

  it('hangs a focus square off a man that follows him when he moves', async () => {
    const te = await who('TE');
    await tap(te);
    await pick('Focus');
    const f = (await play()).focuses[0];
    await press('Move');
    await fingerDrag(page, te, { x: 7, y: 0 });
    await settle();
    expect((await play()).focuses[0]).toEqual(f);
  });
});

describe('a drag that loses contact halfway', () => {
  it('resumes the same man, and is still one step of undo', async () => {
    await press('Move');
    const rb = await who('RB');
    // A hard-pressed pen: contact, travel, a 15ms break, contact again nearby.
    await fingerDrag(page, rb, { x: 2, y: 6 }, 8);
    await page.waitForTimeout(15);
    await fingerDrag(page, { x: 2, y: 6 }, { x: 5, y: 7 }, 8);
    await settle();
    const moved = await who('RB');
    expect(moved.x).toBeCloseTo(5, 0);
    expect(moved.y).toBeCloseTo(7, 0);
    await stepBack();
    const undone = await who('RB');
    expect([undone.x, undone.y]).toEqual([rb.x, rb.y]);
    expect(await canStepBack()).toBe(false);
  });
});
