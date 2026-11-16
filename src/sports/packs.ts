import { back, defender } from '../domain/presets/slots';
import { PLAYER_R, type Formation, type PlayerSlot } from '../domain/types';
import type { SportModule, Variant } from './types';

/*
 * The sport packs: volleyball, lacrosse, ice hockey, and a blank board.
 *
 * A pack is the least a sport can be: a surface and where everybody stands.
 * No concept presets, no rule module, no namer — lines are drawn by hand and
 * with the Pass tool, and Shot where the game has a goal to shoot at. That is
 * the plan's test of the sport module: one of these is a file, a drawing and
 * a list of positions, and nothing anywhere else has to learn about it.
 *
 * Each surface is drawn smaller than life, as the pitch is, so the board's
 * constants — mark size, line weight, snap grid — serve all of them. Origin at
 * the middle; the goal or net being attacked is up the board, the team's own
 * half at +y. The other team is the same shape turned round.
 */

type Spot = [label: string, x: number, y: number];

function sides(id: string, ours: Spot[]): Pick<Variant, 'offense' | 'formations'> {
  const own = (): PlayerSlot[] => ours.map(([l, x, y]) => back(l, x, y));
  const them = (): PlayerSlot[] => ours.map(([l, x, y]) => defender(l, -x, -y));
  return {
    offense: own,
    formations: () =>
      [
        { side: 'offense' as const, players: own() },
        { side: 'defense' as const, players: them() },
      ].map(
        (f): Formation => ({
          id: `builtin-${id}-${f.side === 'defense' ? 'd-' : ''}base`,
          name: 'Base',
          side: f.side,
          players: f.players,
          builtIn: true,
          variant: id,
        }),
      ),
  };
}

function pack(
  id: string,
  name: string,
  variantName: string,
  blurb: string,
  surface: SportModule['surface'],
  view: SportModule['view'],
  spots: Spot[],
  extra: Partial<SportModule> = {},
): SportModule {
  return {
    id,
    name,
    unit: 'yd',
    view,
    markRadius: PLAYER_R,
    surface,
    variants: [
      { id, name: variantName, blurb, playersPerSide: spots.length, minOnLine: 0, blocking: false, ...sides(id, spots) },
    ],
    defaultVariant: id,
    ...extra,
  };
}

const around = (halfWidth: number, halfLength: number, pad = 1.2) => ({
  halfWidth: halfWidth + pad,
  downfield: halfLength + pad,
  behind: halfLength + pad,
});

/* Volleyball: 9 m by 18 m, drawn two board units to the metre. The net is at y = 0. */
const VM = 2;
export const VOLLEY = { halfWidth: 4.5 * VM, halfLength: 9 * VM, attack: 3 * VM };
export const volleyball = pack(
  'volley6',
  'Volleyball',
  '6 v 6',
  'Indoor, six a side, a 5-1 rotation.',
  'volley',
  around(VOLLEY.halfWidth, VOLLEY.halfLength),
  [
    // Front row at the net, back row behind the attack line: zones 4 3 2, then 5 6 1.
    ['OH', -3 * VM, 1.6 * VM],
    ['MB', 0, 1.2 * VM],
    ['OP', 3 * VM, 1.6 * VM],
    ['OH', -3 * VM, 6.5 * VM],
    ['L', 0, 7.2 * VM],
    ['S', 3 * VM, 6.5 * VM],
  ],
  { ballAt: 'S' },
);

/* Lacrosse: 60 yd by 110 yd, men's field, scaled to 22 board units across. */
const LS = 22 / 60;
export const LAX = {
  halfWidth: 30 * LS,
  halfLength: 55 * LS,
  /** Goal line, out from the middle. */
  goal: 40 * LS,
  /** Restraining lines, out from the middle. */
  restrain: 20 * LS,
  crease: 3 * LS,
  wing: 10 * LS,
};
export const lacrosse = pack(
  'lax10',
  'Lacrosse',
  '10 v 10',
  "Men's field: three attack, three middies, three defense and a goalie.",
  'lax',
  around(LAX.halfWidth, LAX.halfLength),
  [
    ['G', 0, LAX.goal],
    ['D', -6, LAX.goal - 4],
    ['D', 0, LAX.goal - 7],
    ['D', 6, LAX.goal - 4],
    ['M', -6, 1.5],
    ['M', 0, 3],
    ['M', 6, 1.5],
    ['A', -6, -LAX.goal + 4],
    ['A', 0, -LAX.goal - 2.4],
    ['A', 6, -LAX.goal + 4],
  ],
  { goal: { x: 0, y: -LAX.goal }, ballAt: 'M' },
);

/* Ice hockey: 85 ft by 200 ft, scaled to 22 board units across. */
const HS = 22 / 85;
export const RINK = {
  halfWidth: 42.5 * HS,
  halfLength: 100 * HS,
  corner: 28 * HS,
  goal: 89 * HS,
  blue: 25 * HS,
  circle: 15 * HS,
  /** The end-zone faceoff spots: across, and out from the middle. */
  dot: { x: 22 * HS, y: 69 * HS },
  crease: 6 * HS,
};
export const hockey = pack(
  'hockey6',
  'Ice hockey',
  '5 v 5 and goalies',
  'Five skaters and a goalie each.',
  'rink',
  around(RINK.halfWidth, RINK.halfLength),
  [
    ['G', 0, RINK.goal - 0.8],
    ['LD', -5, RINK.blue + 2],
    ['RD', 5, RINK.blue + 2],
    ['LW', -7, -2],
    ['C', 0, 0],
    ['RW', 7, -2],
  ],
  { goal: { x: 0, y: -RINK.goal }, ballAt: 'C' },
);

/* A blank board: no lines, for anything else — a drill, another sport, a whiteboard talk. */
export const BLANK = { halfWidth: 11, halfLength: 15 };
export const blank = pack(
  'blank',
  'Blank board',
  'Five a side',
  'No lines and no rules: a whiteboard for anything else.',
  'blank',
  around(BLANK.halfWidth, BLANK.halfLength, 0),
  [
    ['1', -6, 6],
    ['2', -3, 3],
    ['3', 0, 6],
    ['4', 3, 3],
    ['5', 6, 6],
  ],
  { ballAt: '3' },
);

export const PACKS = [volleyball, lacrosse, hockey, blank];
