import { findGap, nearestGap, type Gap } from '../gaps';
import type { AssignmentKind, Hand, PathPoint, PlayerSlot } from '../types';

/**
 * What a defensive concept needs to know beyond where the man is standing.
 *
 * The gap map, because a blitz is aimed at a space between two offensive
 * players and not at a coordinate — the same reason the namer is handed the
 * hole map rather than an x. And the quarterback, because a spy is defined by
 * the man he is spying, exactly as the vision cone is defined by its apex.
 */
export interface DefenseContext {
  gaps: Gap[];
  qb: PlayerSlot | null;
}

export interface DefensePreset {
  id: string;
  name: string;
  /** Rush goes and gets it; drop gives it up ground. The picker groups by this. */
  group: 'rush' | 'drop';
  kind: AssignmentKind;
  /** Forces the direction, exactly as a route preset's hand does. */
  hand?: Hand;
  /** The concept to run when this one is flipped, for anything hand-forced. */
  flipId?: string;
  shape: (start: PlayerSlot, hand: Hand, ctx: DefenseContext) => PathPoint[];
}

const dir = (hand: Hand) => (hand === 'right' ? 1 : -1);

/** Downfield is negative y for both sides, so a defender drops by subtracting. */
const deeper = (start: PlayerSlot, yards: number) => start.y - yards;

/** How far past the line of scrimmage a rush finishes. Penetration, in yards. */
const PENETRATION = 2.4;

/**
 * The aiming point of a blitz: the middle of the named gap, at the line.
 *
 * Falls back to straight ahead rather than to nothing. A front lined up against
 * a short line may genuinely have no C gap, and a blitz that quietly aimed at
 * some other space would be worse than one that runs through where the man is
 * already standing — the coach can see the second kind is wrong.
 */
function aim(start: PlayerSlot, hand: Hand, ctx: DefenseContext, letter: string): number {
  return findGap(ctx.gaps, letter, hand)?.x ?? start.x;
}

/**
 * Rush from where he is to a spot on the line, and on through it.
 *
 * The bend is at the line, not before it: a defender runs at the gap and then
 * through it, and a path that curved early read as running round the block.
 */
function rush(start: PlayerSlot, at: number, depth = PENETRATION): PathPoint[] {
  const closing = (at - start.x) * 0.5;
  const toTheLine: PathPoint[] = [
    { x: start.x, y: start.y },
    { x: at, y: 0, cx: start.x + closing, cy: start.y / 2 },
  ];
  // A fit stops at the line and has nothing past it. Without this, it ended on
  // two points in the same spot, which is a zero-length segment for the
  // arrowhead to take its direction from.
  return depth <= 0 ? toTheLine : [...toTheLine, { x: at + closing * 0.2, y: depth }];
}

export const DEFENSE_PRESETS: DefensePreset[] = [
  // ---- coming to get it ---------------------------------------------------
  {
    id: 'blitz-a',
    name: 'A gap',
    group: 'rush',
    kind: 'blitz',
    shape: (s, h, ctx) => rush(s, aim(s, h, ctx, 'A')),
  },
  {
    id: 'blitz-b',
    name: 'B gap',
    group: 'rush',
    kind: 'blitz',
    shape: (s, h, ctx) => rush(s, aim(s, h, ctx, 'B')),
  },
  {
    id: 'blitz-c',
    name: 'C gap',
    group: 'rush',
    kind: 'blitz',
    shape: (s, h, ctx) => rush(s, aim(s, h, ctx, 'C')),
  },
  {
    /*
     * Whichever space he is already in. A down lineman's job is usually said as
     * "your gap", not as a letter, and a tackle shaded on the guard picking his
     * own gap out of the map is one tap instead of working out which letter he
     * is standing in.
     */
    id: 'blitz-own',
    name: 'His gap',
    group: 'rush',
    kind: 'blitz',
    shape: (s, _h, ctx) => rush(s, nearestGap(ctx.gaps, s.x)?.x ?? s.x),
  },
  {
    /*
     * The edge, and the whole game at this age. Up the field outside everything,
     * then squeeze back in: contain is not a rush lane, it is a promise that
     * nothing gets outside him, so the path has to turn back or it is just a
     * wide blitz.
     */
    id: 'contain',
    name: 'Contain',
    group: 'rush',
    kind: 'contain',
    shape: (s, h) => {
      const d = dir(h);
      const out = s.x + d * 1.8;
      return [
        { x: s.x, y: s.y },
        { x: out, y: 0.4, cx: s.x + d * 1.4, cy: s.y / 2 },
        { x: out + d * 0.3, y: 2.6 },
        { x: out - d * 1.5, y: 3.6, cx: out + d * 0.5, cy: 3.4 },
      ];
    },
  },
  {
    /*
     * The other half of an edge fit: cross the blocker's face and force the ball
     * back outside, to the man who has contain. Drawn tight and inside, which is
     * the difference between spilling a kick-out and being hooked by it.
     */
    id: 'spill',
    name: 'Spill',
    group: 'rush',
    kind: 'blitz',
    shape: (s, h) => {
      const d = dir(h);
      return [
        { x: s.x, y: s.y },
        { x: s.x - d * 0.9, y: 0.2, cx: s.x - d * 0.3, cy: s.y / 2 },
        { x: s.x - d * 2.0, y: 1.6 },
      ];
    },
  },
  {
    /*
     * Mirror the quarterback rather than chase him. Anchored on the man like the
     * vision cone is, so swapping the offense underneath re-aims it; with no
     * quarterback on the board there is nothing to spy, and it draws a short
     * step forward instead of a line to the middle of nowhere.
     */
    id: 'spy',
    name: 'Spy',
    group: 'rush',
    kind: 'drop',
    shape: (s, _h, ctx) => {
      const qb = ctx.qb;
      if (!qb) return [{ x: s.x, y: s.y }, { x: s.x, y: s.y + 1.2 }];
      const toward = Math.sign(qb.x - s.x) || 1;
      return [
        { x: s.x, y: s.y },
        { x: s.x + toward * Math.min(1.6, Math.abs(qb.x - s.x)), y: Math.min(s.y + 1.4, qb.y - 2) },
      ];
    },
  },
  {
    /*
     * Downhill into the nearest gap and stop at the line. A run fit, not a rush:
     * the linebacker's job is to be in that space when the ball gets there, and
     * a path that carried on into the backfield would be saying blitz.
     */
    id: 'fill',
    name: 'Fill',
    group: 'rush',
    kind: 'blitz',
    shape: (s, _h, ctx) => rush(s, nearestGap(ctx.gaps, s.x)?.x ?? s.x, 0),
  },

  // ---- giving up ground ---------------------------------------------------
  {
    id: 'drop-hook',
    name: 'Hook',
    group: 'drop',
    kind: 'drop',
    shape: (s) => [
      { x: s.x, y: s.y },
      { x: s.x, y: deeper(s, 5) },
    ],
  },
  {
    id: 'drop-curl',
    name: 'Curl',
    group: 'drop',
    kind: 'drop',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + dir(h) * 3, y: deeper(s, 6), cx: s.x + dir(h) * 0.6, cy: deeper(s, 4) },
    ],
  },
  {
    id: 'drop-flat',
    name: 'Flat',
    group: 'drop',
    kind: 'drop',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + dir(h) * 6, y: deeper(s, 3), cx: s.x + dir(h) * 3, cy: deeper(s, 3) },
    ],
  },
  {
    id: 'drop-deep',
    name: 'Bail deep',
    group: 'drop',
    kind: 'drop',
    shape: (s) => [
      { x: s.x, y: s.y },
      { x: s.x, y: deeper(s, 12) },
    ],
  },
  {
    /*
     * Deep and outside, the third a corner takes. Aimed at the sideline side he
     * is already on, which is what 'toward the wide side' means for a defender
     * standing out there.
     */
    id: 'drop-third',
    name: 'Bail 1/3',
    group: 'drop',
    kind: 'drop',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + dir(h) * 2.5, y: deeper(s, 12), cx: s.x, cy: deeper(s, 7) },
    ],
  },
];

export const defensePresetById = (id: string) =>
  DEFENSE_PRESETS.find((p) => p.id === id) ?? null;

/** Every defensive concept, so the flip and the namer can look one up by id. */
export function isDefensePreset(id: string | undefined): boolean {
  return !!id && DEFENSE_PRESETS.some((p) => p.id === id);
}
