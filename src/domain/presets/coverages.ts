import { eligibleReceivers } from '../legality';
import { naturalHand } from './routes';
import { ZONE_PRESETS, type FieldSize } from './zones';
import type { PlayerSlot, Zone } from '../types';

/**
 * A whole coverage, applied at once.
 *
 * The presets one level down are per man: this one is the call. A coverage is
 * the only thing on the defensive side that genuinely has to be decided for
 * seven players together — who has the deep third only means anything once you
 * know who else is deep — so it is written as a function of the whole front
 * rather than as seven taps that happen to add up.
 *
 * It reads the front off the board instead of shipping fixed positions with
 * each call, which is the same reason presets are functions of where a man is
 * standing: Cover 3 out of a 5-2 and Cover 3 out of a 3-3 are the same call and
 * two different pictures, and the coach only ever draws one of them.
 */
export interface CoveragePreset {
  id: string;
  name: string;
  /** How many men are kept over the top. The rest play underneath or man up. */
  deep: number;
  /** Underneath defenders take a man each rather than a spot. */
  manUnder: boolean;
}

export const COVERAGES: CoveragePreset[] = [
  { id: 'cover-0', name: 'Cover 0', deep: 0, manUnder: true },
  { id: 'cover-1', name: 'Cover 1', deep: 1, manUnder: true },
  { id: 'cover-2', name: 'Cover 2', deep: 2, manUnder: false },
  { id: 'cover-2-man', name: '2 Man', deep: 2, manUnder: true },
  { id: 'cover-3', name: 'Cover 3', deep: 3, manUnder: false },
];

export const coverageById = (id: string | undefined) =>
  COVERAGES.find((c) => c.id === id) ?? null;

/** A man within this much of the ball is rushing, not covering. */
const ON_BALL = 2.6;

export interface CoverageResult {
  zones: Zone[];
  /** Defender to receiver, for the caller to turn into cover lines. */
  man: { defenderId: string; receiverId: string }[];
}

const zoneShape = (id: string) => ZONE_PRESETS.find((z) => z.id === id)!;

/**
 * Split the deep part of the field into the pieces the CALL asks for, and hand
 * them out to whoever is back there.
 *
 * Divided by the call and not by the head count, which is the whole difference
 * between a drawing that teaches and one that flatters. Cover 3 played with two
 * deep men is three thirds with one of them nobody's, and that missing third is
 * exactly what a coach needs to see — sizing the pieces to fit the men he has
 * would quietly draw a working coverage over a hole in it.
 *
 * Each man takes the piece he is nearest, once. Two safeties on the same hash
 * would otherwise both be given the same space, which is a picture of a
 * coverage nobody plays.
 */
function deepZones(deepMen: PlayerSlot[], parts: number, field: FieldSize): Zone[] {
  if (!parts || !deepMen.length) return [];

  // One deep man is a middle-of-the-field player, not a man with the whole
  // width: Cover 1 is a robber over the ball, and drawing it as a 22-yard box
  // would say something the call does not.
  if (parts === 1) {
    const [man] = [...deepMen].sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    return [{ playerId: man.id, ...zoneShape('middle').shape(man, naturalHand(man), field) }];
  }

  const width = (field.halfWidth * 2) / parts;
  const centers = Array.from({ length: parts }, (_, i) => -field.halfWidth + width * (i + 0.5));
  const label = parts === 2 ? 'Deep 1/2' : parts === 3 ? 'Deep 1/3' : `Deep 1/${parts}`;
  const preset = parts === 2 ? 'half' : 'third';

  const sorted = [...deepMen].sort((a, b) => a.x - b.x);

  /*
   * With a man for every piece they are handed out in order, left to right,
   * which is both how it is taught and the only assignment that never crosses:
   * nearest-piece-first would give the middle safety an outside third simply
   * because a team-mate got to the middle one before him.
   */
  if (sorted.length === centers.length) {
    return sorted.map((man, i) => ({
      playerId: man.id,
      x: centers[i],
      y: -14,
      w: width,
      h: 12,
      preset,
      label,
    }));
  }

  // Short-handed: each man takes the piece he is nearest, and whatever is left
  // over is the part of the field this call has vacated.
  const free = [...centers];
  return sorted.flatMap((man) => {
    if (!free.length) return [];
    let best = 0;
    for (let i = 1; i < free.length; i++) {
      if (Math.abs(free[i] - man.x) < Math.abs(free[best] - man.x)) best = i;
    }
    const [x] = free.splice(best, 1);
    return [{ playerId: man.id, x, y: -14, w: width, h: 12, preset, label }];
  });
}

/**
 * Hand out the underneath spots by where a man is already standing: a man out
 * past the end of the line has the flat, a man over the ball has a hook.
 *
 * By his position and not by his place in the row, which is the difference
 * between two linebackers over the guards both having hooks — right — and the
 * wider of the two being handed a flat he is nowhere near, because he happened
 * to be the outside one of two.
 */
const FLAT_FROM_BALL = 3;

function underZones(men: PlayerSlot[], field: FieldSize): Zone[] {
  return men.map((man) => {
    const preset = zoneShape(Math.abs(man.x) > FLAT_FROM_BALL ? 'flat' : 'hook');
    return { playerId: man.id, ...preset.shape(man, naturalHand(man), field) };
  });
}

/**
 * Pair each covering defender with a receiver, nearest first.
 *
 * Greedy and by distance, which is what man coverage actually is at this age —
 * "you have the man over you". A receiver is claimed once, so two defenders can
 * never be drawn onto the same kid, and a defender left without one simply gets
 * no line rather than a line to somebody already covered.
 */
function pairUp(defenders: PlayerSlot[], receivers: PlayerSlot[]) {
  const free = [...receivers];
  const pairs: { defenderId: string; receiverId: string }[] = [];

  for (const d of [...defenders].sort((a, b) => a.x - b.x)) {
    if (!free.length) break;
    let best = 0;
    for (let i = 1; i < free.length; i++) {
      if (Math.hypot(free[i].x - d.x, free[i].y - d.y) < Math.hypot(free[best].x - d.x, free[best].y - d.y)) {
        best = i;
      }
    }
    pairs.push({ defenderId: d.id, receiverId: free[best].id });
    free.splice(best, 1);
  }

  return pairs;
}

export function applyCoverage(
  coverage: CoveragePreset,
  players: PlayerSlot[],
  field: FieldSize,
): CoverageResult {
  // Off the ball is the whole test for who is covering. A man on the line is
  // rushing whatever the call is, and a coverage that quietly dropped a down
  // lineman would be drawing a scheme the coach did not ask for.
  const covering = players
    .filter((p) => p.side === 'defense' && p.y < -ON_BALL)
    .sort((a, b) => a.y - b.y);

  const deepMen = covering.slice(0, coverage.deep);
  const under = covering.slice(coverage.deep);

  /*
   * Only men who can actually catch it. Pairing by raw distance without this
   * put a linebacker in man coverage on the center, which is not a mistake a
   * coach would make and not one he should have to undo.
   */
  const receivers = eligibleReceivers(players);

  return {
    zones: [
      ...deepZones(deepMen, coverage.deep, field),
      ...(coverage.manUnder ? [] : underZones(under, field)),
    ],
    man: coverage.manUnder ? pairUp(under, receivers) : [],
  };
}
