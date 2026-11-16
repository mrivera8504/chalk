import { PLAYER_R, type Formation, type PlayerSlot } from '../../domain/types';
import { back, defender } from '../../domain/presets/slots';
import type { SportModule, Variant } from '../types';
import { COURT_VIEW } from './court';

/*
 * Basketball, half court, five a side.
 *
 * It rides on what the kinds of football already built: a playbook has a
 * variant, a play carries it from creation, formations and the starred
 * foundation are filtered by it. So `hoops` is a variant like `flag5` is, and
 * which sport a play belongs to is read off its variant rather than stored
 * beside it — one fact, kept once.
 *
 * Offense is numbered one to five, which is what every coach calls them, and
 * the defense is the same numbers with an X. No back numbers: there is no
 * quarterback to hang a cone on and no play namer to read them.
 */

export const HOOPS = 'hoops';

type Spot = [label: string, x: number, y: number];

const five = (spots: Spot[]): PlayerSlot[] => spots.map(([label, x, y]) => back(label, x, y));
const guard = (spots: Spot[]): PlayerSlot[] => spots.map(([label, x, y]) => defender(label, x, y));

const SETS: { name: string; spots: Spot[] }[] = [
  {
    name: '5-out',
    spots: [
      ['1', 0, 9.6],
      ['2', 6.9, 6.6],
      ['3', -6.9, 6.6],
      ['4', -7.4, 1.6],
      ['5', 7.4, 1.6],
    ],
  },
  {
    name: '4-out 1-in',
    spots: [
      ['1', -3.4, 9.3],
      ['2', 3.4, 9.3],
      ['3', -7.1, 5],
      ['4', 7.1, 5],
      ['5', 2.5, 2.7],
    ],
  },
  {
    name: 'Horns',
    spots: [
      ['1', 0, 10],
      ['2', 7.4, 1.6],
      ['3', -7.4, 1.6],
      ['4', -2.4, 6.6],
      ['5', 2.4, 6.6],
    ],
  },
  {
    name: 'Box',
    spots: [
      ['1', 0, 10],
      ['2', -2.5, 2.7],
      ['3', 2.5, 2.7],
      ['4', -2.4, 6.6],
      ['5', 2.4, 6.6],
    ],
  },
  {
    name: '1-4 high',
    spots: [
      ['1', 0, 10.4],
      ['2', -7, 6.5],
      ['3', 7, 6.5],
      ['4', -2.4, 6.5],
      ['5', 2.4, 6.5],
    ],
  },
];

const DEFENSES: { name: string; spots: Spot[] }[] = [
  {
    // Each a step and a half toward the rim from a 5-out: between man and basket.
    name: 'Man',
    spots: [
      ['X1', 0, 7.9],
      ['X2', 5.5, 5.5],
      ['X3', -5.5, 5.5],
      ['X4', -5.7, 2],
      ['X5', 5.7, 2],
    ],
  },
  {
    name: '2-3 zone',
    spots: [
      ['X1', -2.6, 7],
      ['X2', 2.6, 7],
      ['X3', -5, 3],
      ['X4', 5, 3],
      ['X5', 0, 3.2],
    ],
  },
  {
    name: '3-2 zone',
    spots: [
      ['X1', 0, 8],
      ['X2', -5, 6.6],
      ['X3', 5, 6.6],
      ['X4', -2.6, 3],
      ['X5', 2.6, 3],
    ],
  },
  {
    name: '1-3-1',
    spots: [
      ['X1', 0, 8.6],
      ['X2', -5, 5.6],
      ['X3', 5, 5.6],
      ['X4', 0, 2.4],
      ['X5', 0, 5.4],
    ],
  },
];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const hoops: Variant = {
  id: HOOPS,
  name: 'Half court',
  blurb: 'Five a side. Cuts, screens, passes and the ball.',
  playersPerSide: 5,
  minOnLine: 0,
  blocking: false,
  offense: () => five(SETS[0].spots),
  formations: () => [
    ...SETS.map(
      (s): Formation => ({
        id: `builtin-${HOOPS}-${slug(s.name)}`,
        name: s.name,
        side: 'offense',
        players: five(s.spots),
        builtIn: true,
        variant: HOOPS,
      }),
    ),
    ...DEFENSES.map(
      (d): Formation => ({
        id: `builtin-${HOOPS}-d-${slug(d.name)}`,
        name: d.name,
        side: 'defense',
        players: guard(d.spots),
        builtIn: true,
        variant: HOOPS,
      }),
    ),
  ],
};

export const basketball: SportModule = {
  id: 'basketball',
  name: 'Basketball',
  unit: 'yd',
  view: COURT_VIEW,
  markRadius: PLAYER_R,
  variants: [hoops],
  defaultVariant: HOOPS,
};
