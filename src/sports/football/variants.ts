import { back, defender, front, lineman } from '../../domain/presets/slots';
import type { Formation, PlayerSlot } from '../../domain/types';
import type { Variant } from '../types';

/*
 * The kinds of football beside seven-man tackle.
 *
 * Every set is written in the same yards as the seven-man ones and inside the
 * same 22-yard window, so the wide men of an eleven-man set stand closer in
 * than they would on a 53-yard field. That is how a playbook page has always
 * drawn them: the diagram is about who goes where, and the split is the next
 * drag. Line splits are 1.6 yards where five or more share a line with a tight
 * end outside them, because at the seven-man 1.8 the end runs out of board.
 *
 * Nothing here is anybody's playbook. These are the shapes a coach expects to
 * find so the first play is a matter of moving three men rather than placing
 * eleven.
 */

type Builder = () => PlayerSlot[];

function variant(
  v: Omit<Variant, 'formations' | 'offense'>,
  sets: { name: string; players: Builder }[],
  fronts: { name: string; players: Builder }[],
): Variant {
  const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    ...v,
    offense: sets[0].players,
    formations: () => [
      ...sets.map(
        (s): Formation => ({
          id: `builtin-${v.id}-${slug(s.name)}`,
          name: s.name,
          side: 'offense',
          players: s.players(),
          builtIn: true,
          variant: v.id,
        }),
      ),
      ...fronts.map(
        (f): Formation => ({
          id: `builtin-${v.id}-${slug(f.name)}`,
          name: f.name,
          side: 'defense',
          players: f.players(),
          builtIn: true,
          variant: v.id,
        }),
      ),
    ],
  };
}

/* ---- 5 on 5 flag ---------------------------------------------------- */

const flag5 = variant(
  {
    id: 'flag5',
    name: '5v5 flag',
    blurb: 'Five a side, no blocking, no line to fill.',
    playersPerSide: 5,
    // The center has to be there to snap it. Nothing else is asked of the line.
    minOnLine: 1,
    blocking: false,
  },
  [
    {
      name: 'Spread',
      players: () => [
        lineman('X', -7.5),
        lineman('C', 0),
        lineman('Z', 7.5),
        back('Y', -3.8, 1.5),
        back('QB', 0, 4, 1),
      ],
    },
    {
      name: 'Trips right',
      players: () => [
        lineman('X', -7.5),
        lineman('C', 0),
        lineman('Z', 8),
        back('Y', 4.6, 1.5),
        back('QB', 0, 4, 1),
      ],
    },
    {
      name: 'Twins back',
      players: () => [
        lineman('C', 0),
        lineman('Z', 8),
        back('Y', 5, 1.5),
        back('QB', 0, 4, 1),
        back('RB', -1.8, 4.5, 2),
      ],
    },
  ],
  [
    {
      // Named the way a front is: how many in each row, nearest the ball first.
      name: '3-2',
      players: () => [
        defender('C', -7, -5),
        defender('M', 0, -5),
        defender('C', 7, -5),
        defender('S', -4, -11),
        defender('S', 4, -11),
      ],
    },
    {
      name: '2-3',
      players: () => [
        defender('C', -5, -4.5),
        defender('C', 5, -4.5),
        defender('S', -7, -10),
        defender('S', 0, -11),
        defender('S', 7, -10),
      ],
    },
    {
      // The rusher starts seven yards off the ball, which is the rule in most
      // flag leagues and the reason he is drawn back there rather than up.
      name: '1-3-1',
      players: () => [
        defender('R', 1.5, -7, true),
        defender('C', -7, -4.5),
        defender('M', 0, -4.5),
        defender('C', 7, -4.5),
        defender('S', 0, -12),
      ],
    },
  ],
);

/* ---- 6-man ---------------------------------------------------------- */

const six = variant(
  {
    id: 'six',
    name: '6-man',
    blurb: 'Three on the line, everybody eligible.',
    playersPerSide: 6,
    minOnLine: 3,
    blocking: true,
  },
  [
    {
      name: 'Tight',
      players: () => [
        lineman('LE', -1.8),
        lineman('C', 0),
        lineman('RE', 1.8),
        back('QB', 0, 1.6, 1),
        back('FB', -1.6, 3.6),
        back('HB', 0, 5.4, 2),
      ],
    },
    {
      name: 'Spread',
      players: () => [
        lineman('LE', -7),
        lineman('C', 0),
        lineman('RE', 7),
        back('QB', 0, 4, 1),
        back('WB', 4, 1.5),
        back('HB', -1.6, 4.4, 2),
      ],
    },
  ],
  [
    {
      name: '3-2-1',
      players: () =>
        front(
          [-2.2, 0, 2.2],
          [
            { label: 'W', x: -3, y: -4.5 },
            { label: 'M', x: 3, y: -4.5 },
            { label: 'S', x: 0, y: -9.5 },
          ],
        ),
    },
    {
      name: '2-3-1',
      players: () =>
        front(
          [-1.4, 1.4],
          [
            { label: 'W', x: -5, y: -4 },
            { label: 'M', x: 0, y: -4.5 },
            { label: 'S', x: 5, y: -4 },
            { label: 'F', x: 0, y: -10 },
          ],
        ),
    },
    {
      name: '4-2',
      players: () =>
        front(
          [-3.6, -1.2, 1.2, 3.6],
          [
            { label: 'W', x: -2.6, y: -5 },
            { label: 'M', x: 2.6, y: -5 },
          ],
        ),
    },
  ],
);

/* ---- 8-man ---------------------------------------------------------- */

const eight = variant(
  {
    id: 'eight',
    name: '8-man',
    blurb: 'Five on the line, three in the backfield.',
    playersPerSide: 8,
    minOnLine: 5,
    blocking: true,
  },
  [
    {
      name: 'I right',
      players: () => [
        lineman('LE', -3.6),
        lineman('LG', -1.8),
        lineman('C', 0),
        lineman('RG', 1.8),
        lineman('RE', 3.6),
        back('QB', 0, 1.6, 1),
        back('HB', 0, 5.4, 2),
        back('WB', 5.4, 1.5),
      ],
    },
    {
      name: 'Twins',
      players: () => [
        lineman('LE', -3.6),
        lineman('LG', -1.8),
        lineman('C', 0),
        lineman('RG', 1.8),
        lineman('RE', 8.5),
        back('QB', 0, 1.6, 1),
        back('HB', 0, 5.4, 2),
        back('WB', 6, 1.5),
      ],
    },
    {
      name: 'Gun spread',
      players: () => [
        lineman('LE', -8.5),
        lineman('LG', -1.8),
        lineman('C', 0),
        lineman('RG', 1.8),
        lineman('RE', 8.5),
        back('QB', 0, 4.4, 1),
        back('HB', 1.8, 4.4, 2),
        back('WB', -5.4, 1.5),
      ],
    },
  ],
  [
    {
      name: '3-3-2',
      players: () =>
        front(
          [-2.4, 0, 2.4],
          [
            { label: 'W', x: -4.6, y: -4.5 },
            { label: 'M', x: 0, y: -4.5 },
            { label: 'S', x: 4.6, y: -4.5 },
            { label: 'C', x: -7, y: -9 },
            { label: 'C', x: 7, y: -9 },
          ],
        ),
    },
    {
      name: '5-3',
      players: () =>
        front(
          [-3.6, -1.8, 0, 1.8, 3.6],
          [
            { label: 'W', x: -4, y: -4.6 },
            { label: 'M', x: 0, y: -4.6 },
            { label: 'S', x: 4, y: -4.6 },
          ],
        ),
    },
    {
      name: '4-2-2',
      players: () =>
        front(
          [-3.4, -1.2, 1.2, 3.4],
          [
            { label: 'W', x: -2.6, y: -4.5 },
            { label: 'M', x: 2.6, y: -4.5 },
            { label: 'C', x: -7, y: -9 },
            { label: 'C', x: 7, y: -9 },
          ],
        ),
    },
  ],
);

/* ---- 9-man ---------------------------------------------------------- */

const nine = variant(
  {
    id: 'nine',
    name: '9-man',
    blurb: 'Five on the line, four behind it.',
    playersPerSide: 9,
    minOnLine: 5,
    blocking: true,
  },
  [
    {
      name: 'I right',
      players: () => [
        lineman('LE', -3.6),
        lineman('LG', -1.8),
        lineman('C', 0),
        lineman('RG', 1.8),
        lineman('RE', 3.6),
        back('QB', 0, 1.6, 1),
        back('FB', 0, 3.6),
        back('HB', 0, 5.6, 2),
        back('WB', 5.4, 1.5),
      ],
    },
    {
      name: 'Wing T',
      players: () => [
        lineman('LE', -3.6),
        lineman('LG', -1.8),
        lineman('C', 0),
        lineman('RG', 1.8),
        lineman('RE', 3.6),
        back('QB', 0, 1.6, 1),
        back('FB', 0, 4),
        back('HB', -2.4, 4.6, 2),
        back('WB', 5.4, 1.5),
      ],
    },
    {
      name: 'Gun twins',
      players: () => [
        lineman('LE', -8.5),
        lineman('LG', -1.8),
        lineman('C', 0),
        lineman('RG', 1.8),
        lineman('RE', 8.5),
        back('QB', 0, 4.4, 1),
        back('HB', 1.8, 4.4, 2),
        back('WB', 5.6, 1.5),
        back('SB', -5.6, 1.5),
      ],
    },
  ],
  [
    {
      name: '4-3-2',
      players: () =>
        front(
          [-3.4, -1.2, 1.2, 3.4],
          [
            { label: 'W', x: -3.4, y: -4.5 },
            { label: 'M', x: 0, y: -4.5 },
            { label: 'S', x: 3.4, y: -4.5 },
            { label: 'C', x: -7, y: -9 },
            { label: 'C', x: 7, y: -9 },
          ],
        ),
    },
    {
      name: '5-2-2',
      players: () =>
        front(
          [-3.6, -1.8, 0, 1.8, 3.6],
          [
            { label: 'W', x: -2.4, y: -4.6 },
            { label: 'M', x: 2.4, y: -4.6 },
            { label: 'C', x: -7, y: -9 },
            { label: 'C', x: 7, y: -9 },
          ],
        ),
    },
    {
      name: '3-3-3',
      players: () =>
        front(
          [-2.4, 0, 2.4],
          [
            { label: 'W', x: -4.6, y: -4.5 },
            { label: 'M', x: 0, y: -4.5 },
            { label: 'S', x: 4.6, y: -4.5 },
            { label: 'C', x: -7.5, y: -9 },
            { label: 'F', x: 0, y: -11 },
            { label: 'C', x: 7.5, y: -9 },
          ],
        ),
    },
  ],
);

/* ---- 11-man --------------------------------------------------------- */

const secondary = [
  { label: 'C', x: -9.5, y: -5 },
  { label: 'C', x: 9.5, y: -5 },
  { label: 'FS', x: -3.4, y: -11 },
  { label: 'SS', x: 3.8, y: -9.5 },
];

const eleven = variant(
  {
    id: 'eleven',
    name: '11-man',
    blurb: 'Seven on the line. The full game.',
    playersPerSide: 11,
    minOnLine: 7,
    blocking: true,
  },
  [
    {
      name: 'Pro I',
      players: () => [
        lineman('X', -9.5),
        lineman('LT', -3.2),
        lineman('LG', -1.6),
        lineman('C', 0),
        lineman('RG', 1.6),
        lineman('RT', 3.2),
        lineman('TE', 4.8),
        back('Z', 8.6, 1.5),
        back('QB', 0, 1.6, 1),
        back('FB', 0, 3.6),
        back('HB', 0, 5.6, 2),
      ],
    },
    {
      name: 'Gun spread',
      players: () => [
        lineman('X', -9.5),
        lineman('LT', -3.2),
        lineman('LG', -1.6),
        lineman('C', 0),
        lineman('RG', 1.6),
        lineman('RT', 3.2),
        lineman('Z', 9.5),
        back('H', -6.4, 1.5),
        back('Y', 6.4, 1.5),
        back('QB', 0, 4.4, 1),
        back('RB', 1.7, 4.4, 2),
      ],
    },
    {
      name: 'Singleback',
      players: () => [
        lineman('X', -9.5),
        lineman('LT', -3.2),
        lineman('LG', -1.6),
        lineman('C', 0),
        lineman('RG', 1.6),
        lineman('RT', 3.2),
        lineman('TE', 4.8),
        back('H', -6.4, 1.5),
        back('Z', 8.6, 1.5),
        back('QB', 0, 1.6, 1),
        back('RB', 0, 5.4, 2),
      ],
    },
  ],
  [
    {
      name: '4-3',
      players: () =>
        front(
          [-4.2, -1.4, 1.4, 4.2],
          [
            { label: 'W', x: -3.2, y: -4.5 },
            { label: 'M', x: 0, y: -4.5 },
            { label: 'S', x: 3.2, y: -4.5 },
            ...secondary,
          ],
        ),
    },
    {
      name: '3-4',
      players: () =>
        front(
          [-3, 0, 3],
          [
            { label: 'W', x: -5.6, y: -3 },
            { label: 'M', x: -1.7, y: -4.5 },
            { label: 'M', x: 1.7, y: -4.5 },
            { label: 'S', x: 5.6, y: -3 },
            ...secondary,
          ],
        ),
    },
    {
      name: '4-2-5',
      players: () =>
        front(
          [-4.2, -1.4, 1.4, 4.2],
          [
            { label: 'W', x: -2, y: -4.5 },
            { label: 'M', x: 2, y: -4.5 },
            { label: 'N', x: 6.2, y: -4 },
            ...secondary,
          ],
        ),
    },
  ],
);

/** Every kind but seven-man tackle, which is the app as it has always been. */
export const OTHER_VARIANTS: Variant[] = [flag5, six, eight, nine, eleven];
