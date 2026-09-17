/**
 * What the board is drawn on: grass, or paper.
 *
 * The app shipped with one surface — dark turf — and print had another, worked
 * out in `export/render.tsx` and confirmed on a real sheet. A coach who wants a
 * white board on screen wants that second surface, not a third one invented
 * beside it: the whole point of the print palette is that it is the palette that
 * survives white, and a hand-picked screen version would drift from it the first
 * time either was touched. So there is one paper palette, defined here, and both
 * the white board and every printed sheet are drawn with it.
 *
 * Two halves, for the reason `printInk.ts` explains at length. The *structure* —
 * turf, yard lines, the discs the players stand in — is set by hand, because it
 * is not the coach's to choose. The *ink* is derived from whatever the coach
 * actually picked in Settings, hue intact, so a white board shows their colors
 * rather than somebody else's idea of them.
 */

import { inkForPaper } from '../export/printInk';

/**
 * Paper structure.
 *
 * A call sheet gets photocopied, rained on and read at arm's length on a
 * sideline, and the dark board that works on a screen at night turns into a
 * solid block of toner. White field, black marks, gray yard lines.
 *
 * `--locked` is deliberately absent. It is a 0.2yd gold dot in the corner of a
 * mark, it reads well enough on white as it is, and it is the one token here
 * that print has always left alone — changing it would mean another trip to a
 * printer to find out whether it was an improvement.
 */
export const PAPER_STRUCTURE: Record<string, string> = {
  '--turf': '#ffffff',
  '--turf-line': 'rgba(0, 0, 0, 0.16)',
  '--los': 'rgba(0, 0, 0, 0.55)',
  '--hole': 'rgba(0, 0, 0, 0.45)',
  '--off-fill': '#ffffff',
  '--off-line': '#000000',
  '--off-text': '#000000',
  '--def-fill': 'rgba(255, 255, 255, 0.9)',
  '--def-line': '#000000',
  '--def-text': '#000000',
  '--board-chalk': '#000000',
  '--ball-line': '#ffffff',
  '--jersey': '#334155',
  /*
   * The highlights go gray. They are laid under the play at a tenth of their
   * alpha, and a yellow wash that reads on dark turf comes out as either nothing
   * at all or a stain across the routes drawn over it.
   */
  '--vision': '#1f2937',
  '--focus': '#1f2937',
};

/**
 * The tokens carrying the coach's own palette, derived rather than replaced.
 *
 * `--select` and `--hover` are in here for the white board's sake, not paper's:
 * a play is exported with nothing selected and nothing hovered, so on a sheet
 * they are written and never referenced. On screen they are the ring round the
 * man in hand, and the screen's pale blue is invisible on white.
 */
export const INK_TOKENS = [
  '--route-0',
  '--route-1',
  '--route-2',
  '--route-3',
  '--route-4',
  '--route-5',
  '--ink-block',
  '--ink-carry',
  '--ink-motion',
  '--ink-option',
  '--ink-blitz',
  '--ink-cover',
  /* The color a route falls back to when it has no color of its own, and the
     one the live freehand stroke is painted in. */
  '--ink-route',
  '--ball',
  '--zone',
  '--select',
  '--hover',
];

/**
 * The whole paper palette, as a map of token to value.
 *
 * Read off the live document root every time rather than computed once, because
 * the swatches in Settings write straight onto it: a palette cached at module
 * load would draw the colors the app shipped with instead of the ones the coach
 * chose.
 */
export function paperPalette(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = { ...PAPER_STRUCTURE };
  for (const t of INK_TOKENS) out[t] = inkForPaper(cs.getPropertyValue(t).trim());
  return out;
}

/** The same thing as a CSS declaration list, for the `<style>` of an export. */
export function paperCss(): string {
  return Object.entries(paperPalette())
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}
