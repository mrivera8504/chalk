import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launch, man, openApp, penHover, penTap, savedPlay } from './pen';

/**
 * The steps of a play, running it, and the court — the three things stage 4
 * put on the board, each through the controls a coach would use.
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
afterEach(async () => {
  await close();
});

const settle = () => page.waitForTimeout(220);
const press = async (name: string | RegExp) => {
  await page.getByRole('button', { name, exact: typeof name === 'string' }).first().click();
  await settle();
};
const pick = async (text: string) => {
  await page.locator('.inspector button').filter({ hasText: new RegExp(`^${text}$`) }).first().click();
  await settle();
};
const chips = () => page.locator('.step-chips button').count();
type Saved = {
  variant?: string;
  ballCarrierId?: string;
  players: { id: string; label: string; x: number; y: number }[];
  assignments: { kind: string; playerId: string; targetPlayerId?: string; preset?: string; path: { x: number; y: number }[] }[];
  frames?: { players: { id: string; x: number; y: number }[]; assignments: unknown[]; ballCarrierId?: string }[];
};
const saved = () => savedPlay(page) as Promise<Saved>;

async function football() {
  const opened = await openApp(browser);
  page = opened.page;
  close = () => opened.context.close();
  await page.getByRole('button', { name: 'New play', exact: true }).click();
  await page.locator('.stage > svg').first().waitFor();
  await settle();
}

async function court() {
  const opened = await openApp(browser, { welcome: true });
  page = opened.page;
  close = () => opened.context.close();
  await page.getByRole('button', { name: 'Basketball' }).click();
  await page.getByRole('button', { name: 'Start my playbook' }).click();
  await page.getByRole('button', { name: 'New play', exact: true }).click();
  await page.locator('.stage > svg').first().waitFor();
  await settle();
}

describe('steps', () => {
  it('opens every play on one step, with nothing extra saved', async () => {
    await football();
    expect(await chips()).toBe(1);
    expect((await saved()).frames).toBeUndefined();
  });

  it('adds a step with everybody where their line left them, and comes back to the first', async () => {
    await football();
    const before = await saved();
    const wb = man(before, 'WB');
    await penTap(page, wb);
    await settle();
    await pick('Slant');
    const drawn = (await saved()).assignments[0];
    const end = drawn.path[drawn.path.length - 1];

    await press('Add a step');
    expect(await chips()).toBe(2);
    expect(await page.getByRole('button', { name: 'Step 2' }).getAttribute('aria-pressed')).toBe('true');
    const after = await saved();
    // The first step is still the play; the second rides behind it.
    expect(after.assignments.length).toBe(1);
    expect(after.players.find((p) => p.id === wb.id)).toMatchObject({ x: wb.x, y: wb.y });
    expect(after.frames!.length).toBe(1);
    expect(after.frames![0].assignments).toEqual([]);
    expect(after.frames![0].players.find((p) => p.id === wb.id)).toMatchObject({ x: end.x, y: end.y });

    await press('Step 1');
    expect(await page.getByRole('button', { name: 'Step 1' }).getAttribute('aria-pressed')).toBe('true');
    expect((await saved()).assignments.length).toBe(1);
  });

  it('takes a step away by its own chip, after asking', async () => {
    await football();
    await press('Add a step');
    await press('Step 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await settle();
    expect(await chips()).toBe(2);
    await press('Step 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Remove step' }).click();
    await settle();
    expect(await chips()).toBe(1);
    expect((await saved()).frames).toBeUndefined();
  });

  it('does nothing when the only step is tapped', async () => {
    await football();
    await press('Step 1');
    expect(await page.getByRole('dialog').count()).toBe(0);
  });
});

describe('running a play', () => {
  it('runs it over the board and stops by itself, leaving the play as it was', async () => {
    await football();
    const before = await saved();
    await penTap(page, man(before, 'WB'));
    await settle();
    await pick('Slant');
    await penTap(page, { x: 9, y: -18 });
    await settle();
    const drawn = JSON.stringify((await saved()).assignments);

    await press('Run the play');
    await page.locator('svg.playback').waitFor();
    // It moved: the wingback is somewhere along his line, not on his spot.
    await page.waitForTimeout(900);
    expect(await page.locator('svg.playback').count()).toBe(1);
    await page.locator('svg.playback').waitFor({ state: 'detached', timeout: 5000 });
    expect(JSON.stringify((await saved()).assignments)).toBe(drawn);
    expect((await saved()).players).toEqual(before.players);
  });

  it('stops on a pen tap, and the tap picks nothing up', async () => {
    await football();
    const before = await saved();
    await press('Run the play');
    await page.locator('svg.playback').waitFor();
    await penTap(page, man(before, 'QB'));
    await page.locator('svg.playback').waitFor({ state: 'detached', timeout: 2000 });
    await settle();
    expect(await page.locator('.inspector').count()).toBe(0);
    expect((await saved()).players).toEqual(before.players);
  });
});

describe('the court', () => {
  it('opens a basketball play on a court, five out, with the ball at the point', async () => {
    await court();
    expect(await page.locator('.stage > svg .court').count()).toBe(1);
    const play = await saved();
    expect(play.variant).toBe('hoops');
    expect(play.players.map((p) => p.label).sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(play.ballCarrierId).toBe(man(play, '1').id);
    // Nothing a court has no use for.
    for (const gone of ['Block', 'Hole numbers', 'Gap letters', 'New defense']) {
      expect(await page.getByRole('button', { name: gone, exact: true }).count(), gone).toBe(0);
    }
    expect(await page.locator('.legality').count()).toBe(0);
  });

  it('gives a man a cut from his own list, and takes it back off', async () => {
    await court();
    const play = await saved();
    await penTap(page, man(play, '2'));
    await settle();
    await pick('Backdoor');
    const cut = (await saved()).assignments[0];
    expect(cut).toMatchObject({ kind: 'route', preset: 'hoops-backdoor', playerId: man(play, '2').id });
    await pick('Backdoor');
    expect((await saved()).assignments).toEqual([]);
  });

  it('passes with two taps, and the next step opens with the ball caught', async () => {
    await court();
    const play = await saved();
    await press('Pass');
    await penTap(page, man(play, '1'));
    await settle();
    await penTap(page, man(play, '3'));
    await settle();
    const pass = (await saved()).assignments[0];
    expect(pass).toMatchObject({ kind: 'pass', playerId: man(play, '1').id, targetPlayerId: man(play, '3').id });
    // No defense was dropped onto the court to pass against.
    expect((await saved()).players.length).toBe(5);

    await press('Add a step');
    expect((await saved()).frames![0].ballCarrierId).toBe(man(play, '3').id);
  });

  it('screens for a teammate and shoots, each the one line it should be', async () => {
    await court();
    const play = await saved();
    await press('Screen');
    await penTap(page, man(play, '5'));
    await settle();
    await penTap(page, man(play, '2'));
    await settle();
    expect((await saved()).assignments[0]).toMatchObject({ kind: 'screen', targetPlayerId: man(play, '2').id });

    await press('Actions');
    await penTap(page, man(play, '1'));
    await settle();
    await pick('Drive');
    await pick('Shot');
    const lines = (await saved()).assignments.filter((a) => a.playerId === man(play, '1').id);
    expect(lines.map((a) => a.kind).sort()).toEqual(['dribble', 'shot']);
    // The shot leaves from where the drive ends, not from where he started.
    const drive = lines.find((a) => a.kind === 'dribble')!;
    const shot = lines.find((a) => a.kind === 'shot')!;
    const end = drive.path[drive.path.length - 1];
    expect(Math.hypot(shot.path[0].x - end.x, shot.path[0].y - end.y)).toBeLessThan(1);
  });
});

describe('drills and equipment', () => {
  it('opens a drill on an empty board, puts a cone down, moves it with the pen, and steps back over an added player', async () => {
    const opened = await openApp(browser);
    page = opened.page;
    close = () => opened.context.close();
    await page.getByRole('button', { name: 'New drill', exact: true }).click();
    await page.locator('.stage > svg').first().waitFor();
    await settle();
    let play = (await saved()) as Saved & { drill?: boolean; marks?: { id: string; x: number; y: number }[] };
    expect(play.drill).toBe(true);
    expect(play.players).toEqual([]);
    expect(await page.locator('.legality').count()).toBe(0);

    await press('Cone');
    play = (await saved()) as typeof play;
    const cone = play.marks![0];
    expect(cone).toMatchObject({ kind: 'cone' });

    // Move is what Add leaves the board in. Tap, move, tap.
    await penTap(page, cone);
    const to = { x: cone.x + 4, y: cone.y - 3 };
    await penHover(page, cone, to);
    await penTap(page, to);
    await settle();
    play = (await saved()) as typeof play;
    expect(play.marks![0].x).toBeCloseTo(to.x, 0);
    expect(play.marks![0].y).toBeCloseTo(to.y, 0);

    await press('Player');
    expect((await saved()).players.length).toBe(1);

    await press('Step back');
    expect((await saved()).players.length).toBe(0);
  });

  it('labels the board in words the coach typed', async () => {
    const opened = await openApp(browser);
    page = opened.page;
    close = () => opened.context.close();
    await page.getByRole('button', { name: 'New drill', exact: true }).click();
    await page.locator('.stage > svg').first().waitFor();
    await settle();
    await press('Label');
    await page.getByRole('dialog').getByRole('textbox').fill('Start here');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await settle();
    const play = (await saved()) as Saved & { marks?: { kind: string; text?: string }[] };
    expect(play.marks).toEqual([expect.objectContaining({ kind: 'label', text: 'Start here' })]);
    expect(await page.locator('.stage > svg .marks text').innerHTML()).toBe('Start here');
  });
});

describe('undo across steps', () => {
  it('steps back over an edit on step 1 while step 2 is showing, putting step 1 on the board', async () => {
    await football();
    const before = await saved();
    await penTap(page, man(before, 'WB'));
    await settle();
    await pick('Slant');
    await press('Add a step');
    expect(await page.getByRole('button', { name: 'Step 2' }).getAttribute('aria-pressed')).toBe('true');

    // One back: the step that was added goes.
    await press('Step back');
    expect(await chips()).toBe(1);
    // Two back: the slant on step 1 goes too.
    await press('Step back');
    expect((await saved()).assignments).toEqual([]);
    // And forward again, both of them.
    await press('Step forward');
    await press('Step forward');
    expect(await chips()).toBe(2);
    expect((await saved()).assignments.length).toBe(1);
  });

  it('brings a removed step back', async () => {
    await football();
    await press('Add a step');
    await press('Step 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Remove step' }).click();
    await settle();
    expect(await chips()).toBe(1);
    await press('Step back');
    expect(await chips()).toBe(2);
  });
});
