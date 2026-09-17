import { refreshPaths } from '../domain/regenerate';
import type { Play } from '../domain/types';
import { VIEW } from '../render/geometry';


/**
 * How much of the field a sheet shows.
 *
 * The board on screen is a fixed window — 22 yards across and 30 deep, taller
 * than it is wide, because a phone is. Turning the paper sideways did nothing
 * about that: the board kept its shape, the page got wider, and all the extra
 * room went into white margins either side. Worse, widening the window alone
 * would not have helped either, since a board limited by its height is drawn at
 * the same yards-per-inch however much empty sideline is added — you would get
 * a wider picture of the same size play.
 *
 * The play only grows when the *window* takes the shape of the paper. So the
 * window is computed here, from the plays themselves.
 */

/** A viewBox, in yards, origin at the middle of the line of scrimmage. */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_VIEW: View = {
  x: -VIEW.halfWidth,
  y: -VIEW.downfield,
  w: VIEW.halfWidth * 2,
  h: VIEW.downfield + VIEW.behind,
};

export function viewBox(v: View): string {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

/** Room around the outermost mark, so nothing is drawn against the edge. */
const PAD = 2;

/**
 * The least field a sheet will ever show.
 *
 * Without a floor, a goal-line play with everyone inside five yards would be
 * blown up until the players were the size of dinner plates and the field had
 * no context left. Lower than it was: `PAD` already puts two yards of grass
 * round the outermost mark, so the floor only has to catch the extreme case,
 * and every yard of floor beyond what the play uses is a yard the play is
 * shrunk to make room for.
 */
const MIN = { w: 18, h: 15 };

/**
 * How much empty field may be added to meet the shape of the paper.
 *
 * A quarter more than the play needs, and not a yard beyond. Stretching all the
 * way to the paper's proportions is what put a 13-yard play in the middle of a
 * 37-yard field: the yard lines ran to both edges of the sheet and the play sat
 * small in the middle of them, which is what a coach saw and called too small.
 * A little stretch keeps some field around the play; past that the board is
 * simply centred in the cell and the margin left white, which on paper — where
 * the turf is white too — reads as nothing at all.
 */
const STRETCH = 1.25;

/** A player's mark, in yards, so a disc at the edge is not clipped in half. */
const MARK = 1.1;

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function grow(b: Bounds, x: number, y: number, pad = 0): void {
  b.minX = Math.min(b.minX, x - pad);
  b.maxX = Math.max(b.maxX, x + pad);
  b.minY = Math.min(b.minY, y - pad);
  b.maxY = Math.max(b.maxY, y + pad);
}

/**
 * Everything actually drawn for a play, as a box in yards.
 *
 * The paths are regenerated first, exactly as the board and the exporter do it:
 * a block, a cover rope and a stunt are stored as relationships rather than as
 * lines, so a play loaded from the cloud can carry a stale path, and measuring
 * that would size the sheet to a line nobody will see.
 */
function boundsOf(play: Play): Bounds {
  const b: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

  for (const p of play.players) grow(b, p.x, p.y, MARK);

  for (const a of refreshPaths(play.assignments, play.players)) {
    for (const pt of a.path) {
      grow(b, pt.x, pt.y);
      // The control point of a curve can bow well outside its endpoints.
      if (pt.cx !== undefined && pt.cy !== undefined) grow(b, pt.cx, pt.cy);
    }
  }

  for (const path of play.annotations) {
    for (const pt of path) grow(b, pt.x, pt.y);
  }

  for (const z of play.zones ?? []) {
    grow(b, z.x - z.w / 2, z.y - z.h / 2);
    grow(b, z.x + z.w / 2, z.y + z.h / 2);
  }

  return b;
}

/**
 * One window for a whole sheet, shaped to the box it is going into.
 *
 * Every play on the sheet gets the *same* window, deliberately. Fitting each
 * play to its own cell would draw them at whatever zoom each happened to need,
 * and a coach laying two plays side by side to compare a split would be reading
 * two different scales. One window for all of them means a yard is a yard
 * everywhere on the page.
 *
 * Nothing is ever cropped. The window takes in everything every play draws,
 * with room around it, and is then stretched — only ever outwards — to the
 * target proportions. Asking for landscape cannot cut a route off.
 */
/** The window a set of plays needs, before any paper is involved. */
function contentView(plays: Play[]): View {
  /*
   * Seeded with the line of scrimmage and nothing else.
   *
   * It used to start from the board's whole 22-by-30 window and only grow,
   * which meant landscape could widen the field but never trim it — and since
   * a board limited by its height is drawn at the same yards-per-inch however
   * wide it gets, turning the paper bought a wider picture of the same size
   * play. Almost no play uses all thirty yards of depth. Giving back the depth
   * nobody is running into is what actually makes the play bigger.
   *
   * The LOS is in it regardless, because it is the line every position on the
   * board is measured from and a sheet without it is a picture of some men.
   */
  const all: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  for (const play of plays) {
    const b = boundsOf(play);
    if (!Number.isFinite(b.minX)) continue;
    all.minX = Math.min(all.minX, b.minX - PAD);
    all.maxX = Math.max(all.maxX, b.maxX + PAD);
    all.minY = Math.min(all.minY, b.minY - PAD);
    all.maxY = Math.max(all.maxY, b.maxY + PAD);
  }

  const w = Math.max(MIN.w, all.maxX - all.minX);
  const h = Math.max(MIN.h, all.maxY - all.minY);
  const cx = (all.minX + all.maxX) / 2;
  const cy = (all.minY + all.maxY) / 2;

  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * The shape a play wants, before any paper is involved.
 *
 * The grid chooser needs this: it has to score 2×2 against 4×1 knowing roughly
 * how the board will sit in each cell, and the board's shape now comes from the
 * play rather than from a fixed 22-by-30 window. Taken unstretched, so it does
 * not depend on the cell it is about to help choose — which would be circular.
 */
export function contentAspect(plays: Play[]): number {
  const v = contentView(plays);
  return v.w / v.h;
}

/** That window, leaned toward the shape of the cell it is going into. */
export function viewForPlays(plays: Play[], aspect: number): View {
  const v = contentView(plays);
  let { w, h } = v;

  // Toward the paper's proportions, but only so far. Growing is safe; shrinking
  // the other side to hit the ratio would crop, which is the one thing this
  // must never do. Whatever shape is left over, the caller centres.
  if (w / h < aspect) w = Math.min(h * aspect, w * STRETCH);
  else h = Math.min(w / aspect, h * STRETCH);

  const cx = v.x + v.w / 2;
  const cy = v.y + v.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
