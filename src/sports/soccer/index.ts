import { back, defender } from '../../domain/presets/slots';
import { PLAYER_R, type Formation, type PlayerSlot } from '../../domain/types';
import type { SportModule, Variant } from '../types';
import { PITCH_VIEW, SCALE } from './pitch';

/*
 * Soccer, in four sizes.
 *
 * A shape is written as its rows, nearest its own goal first — which is how a
 * shape is said: four-four-two. The keeper is not in the name and is always
 * there. The other team is the same shape turned round to face it, so a coach
 * showing how a 4-3-3 presses a 4-4-2 picks both from the same list.
 *
 * Position names rather than shirt numbers: numbering a back four 2-5-6-3 is
 * one tradition among several, and LB is LB everywhere.
 */

type Rows = string[][];

/** Where the back line and the front line stand, in possession, own goal at +y. */
const BACK_Y = 11.4;
const FRONT_Y = -5.2;
const KEEPER_Y = 16.1;

function spread(count: number): number[] {
  if (count === 1) return [0];
  const gap = Math.min(5.6, 17 / (count - 1));
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * gap);
}

function shape(rows: Rows, own: boolean): PlayerSlot[] {
  const make = own ? back : defender;
  // The other team is this one seen from the far end: every depth turned over.
  const face = own ? 1 : -1;
  const depth = (i: number) =>
    rows.length === 1 ? (BACK_Y + FRONT_Y) / 2 : BACK_Y - (i * (BACK_Y - FRONT_Y)) / (rows.length - 1);
  return [
    make('GK', 0, KEEPER_Y * face),
    ...rows.flatMap((row, i) => spread(row.length).map((x, j) => make(row[j], x * face, depth(i) * face))),
  ];
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function size(
  id: string,
  name: string,
  blurb: string,
  shapes: { name: string; rows: Rows }[],
): Variant {
  const count = 1 + shapes[0].rows.flat().length;
  return {
    id,
    name,
    blurb,
    playersPerSide: count,
    minOnLine: 0,
    blocking: false,
    offense: () => shape(shapes[0].rows, true),
    formations: () =>
      (['offense', 'defense'] as const).flatMap((side) =>
        shapes.map(
          (s): Formation => ({
            id: `builtin-${id}-${side === 'defense' ? 'd-' : ''}${slug(s.name)}`,
            name: s.name,
            side,
            players: shape(s.rows, side === 'offense'),
            builtIn: true,
            variant: id,
          }),
        ),
      ),
  };
}

const eleven = size('soccer11', '11-a-side', 'The full game, keeper included.', [
  { name: '4-4-2', rows: [['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']] },
  { name: '4-3-3', rows: [['LB', 'CB', 'CB', 'RB'], ['CM', 'DM', 'CM'], ['LW', 'ST', 'RW']] },
  { name: '4-2-3-1', rows: [['LB', 'CB', 'CB', 'RB'], ['DM', 'DM'], ['LW', 'AM', 'RW'], ['ST']] },
  { name: '3-5-2', rows: [['CB', 'CB', 'CB'], ['LWB', 'CM', 'DM', 'CM', 'RWB'], ['ST', 'ST']] },
]);

const nine = size('soccer9', '9-a-side', 'Eight outfield and a keeper.', [
  { name: '3-3-2', rows: [['LB', 'CB', 'RB'], ['LM', 'CM', 'RM'], ['ST', 'ST']] },
  { name: '3-2-3', rows: [['LB', 'CB', 'RB'], ['CM', 'CM'], ['LW', 'ST', 'RW']] },
  { name: '2-4-2', rows: [['CB', 'CB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']] },
]);

const seven = size('soccer7', '7-a-side', 'Six outfield and a keeper.', [
  { name: '2-3-1', rows: [['CB', 'CB'], ['LM', 'CM', 'RM'], ['ST']] },
  { name: '3-2-1', rows: [['LB', 'CB', 'RB'], ['CM', 'CM'], ['ST']] },
  { name: '2-1-2-1', rows: [['CB', 'CB'], ['DM'], ['LM', 'RM'], ['ST']] },
]);

const five = size('soccer5', '5-a-side', 'Four outfield and a keeper.', [
  { name: '1-2-1', rows: [['CB'], ['LM', 'RM'], ['ST']] },
  { name: '2-2', rows: [['CB', 'CB'], ['ST', 'ST']] },
  { name: '2-1-1', rows: [['CB', 'CB'], ['CM'], ['ST']] },
]);

export const soccer: SportModule = {
  id: 'soccer',
  name: 'Soccer',
  unit: 'yd',
  yardsPerUnit: 1 / SCALE,
  view: PITCH_VIEW,
  markRadius: PLAYER_R,
  // Smallest first, as football's kinds are.
  variants: [five, seven, nine, eleven],
  defaultVariant: eleven.id,
};
