import { describe, expect, it } from 'vitest';
import { playToSvg, playTitle, sheetName, slug } from '../../src/export/render';
import { viewForPlays } from '../../src/export/view';
import { cover3, oldest, sweep } from '../fixtures/book';

/**
 * What a play looks like, written down.
 *
 * The exporter draws with the same components as the board and the playbook
 * card, so one file per play here stands for all three. These are the proof
 * that a refactor — splitting the editor, moving football into a sport module —
 * drew nothing differently. A diff in one of these files is either a bug or a
 * deliberate change to what coaches see, and should be read as one or the other
 * before it is accepted.
 */
const golden = (name: string) => `./golden/${name}.svg`;

describe('golden boards', () => {
  it('an offensive play with every feature on it', async () => {
    await expect(playToSvg(sweep())).toMatchFileSnapshot(golden('sweep-board'));
  });

  it('the same play for paper, with holes, in a landscape window', async () => {
    const view = viewForPlays([sweep()], 1.29);
    await expect(playToSvg(sweep(), { forPrint: true, showHoles: true, view })).toMatchFileSnapshot(
      golden('sweep-print-landscape'),
    );
  });

  it('a defensive play with zones, a blitz, a stunt and a rope', async () => {
    await expect(playToSvg(cover3(), { showGaps: true })).toMatchFileSnapshot(golden('cover3-board'));
  });

  it('a defense drawn against nobody', async () => {
    await expect(playToSvg({ ...cover3(), hideOffense: true }, { forPrint: true })).toMatchFileSnapshot(
      golden('cover3-print-no-look'),
    );
  });

  it('a play set to white by hand', async () => {
    await expect(playToSvg({ ...sweep(), surface: 'white' })).toMatchFileSnapshot(golden('sweep-white'));
  });

  it('a play saved before any optional field existed', async () => {
    await expect(playToSvg(oldest())).toMatchFileSnapshot(golden('oldest-board'));
  });
});

describe('what a play draws', () => {
  it('follows the play, not the sheet, on which sides are shown', () => {
    const shown = playToSvg(sweep());
    const hidden = playToSvg({ ...sweep(), hideDefense: true });
    expect(hidden.length).toBeLessThan(shown.length);
    expect(playToSvg({ ...cover3(), hideOffense: true })).not.toContain('>QB<');
  });

  it('carries every token it references in its own style block', () => {
    const svg = playToSvg(sweep());
    const style = svg.slice(svg.indexOf('<style>'), svg.indexOf('</style>'));
    const used = new Set([...svg.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    for (const token of used) expect(style, token).toContain(`${token}:`);
  });

  it('has no empty token, which would print black on black', () => {
    const svg = playToSvg(sweep());
    const style = svg.slice(svg.indexOf('<style>') + 7, svg.indexOf('</style>'));
    expect(style).not.toMatch(/--[a-z0-9-]+:(;|})/);
  });

  it('is drawn in yards, in the board\'s own window', () => {
    expect(playToSvg(oldest())).toContain('viewBox="-11 -20 22 30"');
  });
});

describe('naming a sheet', () => {
  const day = new Date().toISOString().slice(0, 10);

  it('calls one play after the play', () => {
    expect(sheetName({ plays: [sweep()], perPage: 1 })).toBe(`26-all-the-way-right-${day}.pdf`);
    expect(playTitle({ ...sweep(), name: 'Jet' })).toBe('Jet');
  });

  it('calls a run of plays after the folder, or the book', () => {
    const plays = [sweep(), oldest()];
    expect(sheetName({ plays, perPage: 1, folder: 'Run game' })).toBe(`run-game-2-plays-${day}.pdf`);
    expect(sheetName({ plays, perPage: 1 })).toBe(`playbook-2-plays-${day}.pdf`);
  });

  it('says how many to a page, so a call sheet and an install sheet do not collide', () => {
    expect(sheetName({ plays: [sweep(), oldest()], perPage: 4, folder: 'Run game' })).toBe(
      `run-game-2-plays-4up-${day}.pdf`,
    );
  });

  it('caps a long name and never returns nothing', () => {
    expect(slug('x'.repeat(80)).length).toBe(48);
    expect(slug('!!!')).toBe('untitled');
  });
});
