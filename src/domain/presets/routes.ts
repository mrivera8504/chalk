import type { Hand, PathPoint, PlayerSlot } from '../types';

/** Which way the concept runs. Every preset is written right and mirrored. */
export type { Hand };

export interface RoutePreset {
  id: string;
  name: string;
  group: 'run' | 'pass';
  /** Ball carrier, so the play namer can find the hole it runs through. */
  carry?: boolean;
  /**
   * Forces the direction instead of taking the one the player's position
   * implies. "All the way left" means left from wherever he is standing; every
   * other concept means toward the wide side.
   */
  hand?: Hand;
  /**
   * The concept to run when this one is flipped. Only forced-hand presets need
   * it: everything else flips by being regenerated with the other hand, but
   * 'All the way right' aims at an absolute sideline, so running it the other
   * way means running its twin rather than mirroring its shape under a name
   * that would then say the wrong thing.
   */
  flipId?: string;
  /** Saved by the user rather than shipped. Shown apart, and deletable. */
  custom?: boolean;
  shape: (start: PlayerSlot, hand: Hand) => PathPoint[];
}

/** Downfield is negative y, so depth is subtracted. */
const up = (start: PlayerSlot, yards: number) => start.y - yards;
const side = (hand: Hand) => (hand === 'right' ? 1 : -1);

/**
 * Presets are functions of where the player is standing, never fixed shapes.
 * A slant from a tight end and a slant from a wing have to start in different
 * places and still read as the same route, which a stored polyline cannot do.
 */
export const ROUTES: RoutePreset[] = [
  // ---- runs ---------------------------------------------------------------
  {
    id: 'dive',
    name: 'Dive',
    group: 'run',
    carry: true,
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 0.8, y: up(s, s.y + 1) },
      { x: s.x + side(h) * 1.2, y: up(s, s.y + 4) },
    ],
  },
  {
    id: 'off-tackle',
    name: 'Off tackle',
    group: 'run',
    carry: true,
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 2.2, y: s.y - 0.6, cx: s.x + side(h) * 1.2, cy: s.y - 0.2 },
      { x: s.x + side(h) * 3.4, y: up(s, s.y + 3) },
      { x: s.x + side(h) * 3.8, y: up(s, s.y + 7) },
    ],
  },
  {
    id: 'sweep',
    name: 'Sweep',
    group: 'run',
    carry: true,
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 4, y: s.y - 1, cx: s.x + side(h) * 2, cy: s.y + 0.4 },
      { x: s.x + side(h) * 7, y: up(s, s.y + 3) },
      { x: s.x + side(h) * 7.6, y: up(s, s.y + 8) },
    ],
  },
  {
    id: 'counter',
    name: 'Counter',
    group: 'run',
    carry: true,
    shape: (s, h) => [
      { x: s.x, y: s.y },
      // A jab step the wrong way, which is the whole point of the concept.
      { x: s.x - side(h) * 1.4, y: s.y - 0.2 },
      { x: s.x + side(h) * 2.4, y: s.y - 1, cx: s.x, cy: s.y - 0.9 },
      { x: s.x + side(h) * 3.2, y: up(s, s.y + 5) },
    ],
  },
  {
    id: 'trap',
    name: 'Trap',
    group: 'run',
    carry: true,
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 0.9, y: s.y - 1.4 },
      { x: s.x + side(h) * 1.4, y: up(s, s.y + 5) },
    ],
  },
  {
    id: 'power',
    name: 'Power',
    group: 'run',
    carry: true,
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 1.8, y: s.y - 1.2, cx: s.x + side(h) * 1.1, cy: s.y - 0.3 },
      { x: s.x + side(h) * 2.6, y: up(s, s.y + 4) },
      { x: s.x + side(h) * 2.8, y: up(s, s.y + 8) },
    ],
  },
  {
    id: 'toss',
    name: 'Toss',
    group: 'run',
    carry: true,
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 3, y: s.y + 1.2, cx: s.x + side(h) * 1.4, cy: s.y + 1.2 },
      { x: s.x + side(h) * 7.5, y: s.y - 1, cx: s.x + side(h) * 6.2, cy: s.y + 0.6 },
      { x: s.x + side(h) * 8.4, y: up(s, s.y + 6) },
    ],
  },

  // ---- pass ---------------------------------------------------------------
  {
    id: 'go',
    name: 'Go',
    group: 'pass',
    shape: (s) => [
      { x: s.x, y: s.y },
      { x: s.x, y: up(s, s.y + 14) },
    ],
  },
  {
    id: 'slant',
    name: 'Slant',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x, y: up(s, s.y + 2) },
      { x: s.x + side(h) * 5, y: up(s, s.y + 6) },
    ],
  },
  /*
   * In and out at three depths. The break is the same shape every time and only
   * the stem changes, which is how they are taught: one rule, three landmarks.
   * 'in' and 'out' keep their old ids so plays saved before this still name the
   * preset they were built from.
   */
  ...breakRoutes('short', 'Short', 4),
  ...breakRoutes('', 'Medium', 7),
  ...breakRoutes('deep', 'Deep', 13),
  {
    id: 'hitch',
    name: 'Hitch',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x, y: up(s, s.y + 5) },
      { x: s.x + side(h) * 0.9, y: up(s, s.y + 3.8) },
    ],
  },
  {
    id: 'corner',
    name: 'Corner',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x, y: up(s, s.y + 6) },
      { x: s.x + side(h) * 5, y: up(s, s.y + 11) },
    ],
  },
  {
    id: 'post',
    name: 'Post',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x, y: up(s, s.y + 6) },
      { x: s.x - side(h) * 5, y: up(s, s.y + 11) },
    ],
  },
  {
    id: 'wheel',
    name: 'Wheel',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 3, y: s.y - 0.5, cx: s.x + side(h) * 1.6, cy: s.y + 0.2 },
      { x: s.x + side(h) * 4.2, y: up(s, s.y + 5), cx: s.x + side(h) * 4.4, cy: s.y - 2 },
      { x: s.x + side(h) * 4.4, y: up(s, s.y + 12) },
    ],
  },
  {
    id: 'screen',
    name: 'Screen',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x + side(h) * 3.5, y: s.y + 1.6, cx: s.x + side(h) * 1.8, cy: s.y + 1.8 },
      { x: s.x + side(h) * 6, y: up(s, s.y + 1) },
    ],
  },
];

/**
 * The in/out pair at one depth: straight up the stem, then square off.
 * An out breaks toward the sideline, an in breaks back toward the ball, which
 * is why one takes `side(h)` and the other takes its negative.
 */
function breakRoutes(prefix: string, label: string, depth: number): RoutePreset[] {
  const id = (kind: string) => (prefix ? `${prefix}-${kind}` : kind);
  return [
    {
      id: id('in'),
      name: `${label} in`,
      group: 'pass',
      shape: (s, h) => [
        { x: s.x, y: s.y },
        { x: s.x, y: up(s, s.y + depth) },
        { x: s.x - side(h) * 4.5, y: up(s, s.y + depth + 0.4) },
      ],
    },
    {
      id: id('out'),
      name: `${label} out`,
      group: 'pass',
      shape: (s, h) => [
        { x: s.x, y: s.y },
        { x: s.x, y: up(s, s.y + depth) },
        { x: s.x + side(h) * 4.5, y: up(s, s.y + depth + 0.4) },
      ],
    },
  ];
}

/** Roughly where the numbers are. Past this and the mark leaves the board. */
const SIDELINE = 9.5;

/**
 * Take it to the sideline and turn up.
 *
 * Aims at an absolute point rather than an offset, because "all the way right"
 * has to mean the same edge of the field whether the back starts in the middle
 * or already out wide. The hand is fixed, so this one concept is two entries.
 */
function wideRun(dir: 1 | -1): RoutePreset['shape'] {
  return (s) => {
    const tx = dir * SIDELINE;
    const mid = s.x + (tx - s.x) * 0.55;
    return [
      { x: s.x, y: s.y },
      { x: mid, y: s.y + 0.9, cx: s.x + (mid - s.x) * 0.4, cy: s.y + 1.35 },
      { x: tx, y: s.y - 1.6, cx: tx - dir * 1.3, cy: s.y + 0.5 },
      { x: tx + dir * 0.4, y: up(s, s.y + 7) },
    ];
  };
}

ROUTES.push(
  {
    id: 'wide-right',
    name: 'All the way right',
    group: 'run',
    carry: true,
    hand: 'right',
    flipId: 'wide-left',
    shape: wideRun(1),
  },
  {
    id: 'wide-left',
    name: 'All the way left',
    group: 'run',
    carry: true,
    hand: 'left',
    flipId: 'wide-right',
    shape: wideRun(-1),
  },
);

const CUSTOM_KEY = 'chalk.routes.v1';

/**
 * A route the user drew, kept relative to the man who ran it.
 *
 * Stored as offsets rather than field positions so the same shape can be given
 * to anybody: that is the whole reason the built-ins are functions of where a
 * player is standing, and a saved route has to behave the same way or it would
 * only ever work from the spot it was drawn.
 */
export interface CustomRoute {
  id: string;
  name: string;
  group: 'run' | 'pass';
  carry?: boolean;
  points: PathPoint[];
}

export function readCustomRoutes(): CustomRoute[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const saved = raw ? (JSON.parse(raw) as CustomRoute[]) : [];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function writeCustomRoutes(all: CustomRoute[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked; the session keeps working */
  }
}

/**
 * Absolute path a player ran, back to offsets, ready to be given to anyone.
 *
 * Anchored on the route's own first point, not on the player. A route is not
 * regenerated when its man is dragged — only blocks are — so a route saved
 * after moving him would otherwise bake in the gap between the two and apply
 * crooked to everybody afterwards.
 */
export function toRelative(path: PathPoint[]): PathPoint[] {
  const [origin] = path;
  return path.map((p) => ({
    x: p.x - origin.x,
    y: p.y - origin.y,
    ...(p.cx !== undefined ? { cx: p.cx - origin.x } : {}),
    ...(p.cy !== undefined ? { cy: p.cy - origin.y } : {}),
  }));
}

/** A saved route, wearing the same face as a built-in one. */
export function toPreset(route: CustomRoute): RoutePreset {
  return {
    id: route.id,
    name: route.name,
    group: route.group,
    carry: route.carry,
    custom: true,
    shape: (s, h) =>
      route.points.map((p) => ({
        x: s.x + side(h) * p.x,
        y: s.y + p.y,
        ...(p.cx !== undefined ? { cx: s.x + side(h) * p.cx } : {}),
        ...(p.cy !== undefined ? { cy: s.y + p.cy } : {}),
      })),
  };
}

export const routeById = (id: string) => ROUTES.find((r) => r.id === id) ?? null;

/** The other way round. 'right' and 'left' are the only two. */
export const otherHand = (h: Hand): Hand => (h === 'right' ? 'left' : 'right');

/** Which way a player naturally runs a concept: toward the wide side. */
export function naturalHand(p: PlayerSlot): Hand {
  return p.x >= 0 ? 'right' : 'left';
}
