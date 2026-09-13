import type { PathPoint, PlayerSlot } from '../types';

/** Which way the concept runs. Every preset is written right and mirrored. */
export type Hand = 'right' | 'left';

export interface RoutePreset {
  id: string;
  name: string;
  group: 'run' | 'pass';
  /** Ball carrier, so the play namer can find the hole it runs through. */
  carry?: boolean;
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
  {
    id: 'out',
    name: 'Out',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x, y: up(s, s.y + 6) },
      { x: s.x + side(h) * 4.5, y: up(s, s.y + 6.4) },
    ],
  },
  {
    id: 'in',
    name: 'In',
    group: 'pass',
    shape: (s, h) => [
      { x: s.x, y: s.y },
      { x: s.x, y: up(s, s.y + 6) },
      { x: s.x - side(h) * 4.5, y: up(s, s.y + 6.4) },
    ],
  },
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

export const routeById = (id: string) => ROUTES.find((r) => r.id === id) ?? null;

/** Which way a player naturally runs a concept: toward the wide side. */
export function naturalHand(p: PlayerSlot): Hand {
  return p.x >= 0 ? 'right' : 'left';
}
