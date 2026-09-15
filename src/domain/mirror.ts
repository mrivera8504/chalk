import { otherHand, routeById } from './presets/routes';
import type { Assignment, PathPoint, PlayerSlot, Zone } from './types';

const flipPoint = (p: PathPoint): PathPoint => ({
  x: -p.x,
  y: p.y,
  ...(p.cx !== undefined ? { cx: -p.cx } : {}),
  ...(p.cy !== undefined ? { cy: p.cy } : {}),
  // Weight is not geometry: a mirrored stroke was pressed exactly as hard.
  ...(p.w !== undefined ? { w: p.w } : {}),
});

/**
 * Flip a play about the middle of the field. Only x changes: depth, the line of
 * scrimmage and every relationship to it stay exactly as they were. Hole
 * numbers are not touched here because they are recomputed from the formation,
 * which is the point of computing them rather than storing them.
 */
export function mirrorPlayers(players: PlayerSlot[]): PlayerSlot[] {
  return players.map((p) => ({ ...p, x: -p.x }));
}

/**
 * The hand and the concept flip with the geometry, not just the points.
 *
 * A sweep whose path has been mirrored is now a sweep to the other side, and
 * anything that reads the assignment afterwards — flipping this one run, or
 * naming the play — has to be told so. The two wide runs aim at a named
 * sideline, so mirroring one turns it into its twin outright: the mirrored
 * path is exactly what the twin generates from the mirrored player.
 */
export function mirrorAssignments(assignments: Assignment[]): Assignment[] {
  return assignments.map((a) => {
    const twin = a.preset ? routeById(a.preset)?.flipId : undefined;
    return {
      ...a,
      path: a.path.map(flipPoint),
      ...(a.hand ? { hand: otherHand(a.hand) } : {}),
      ...(twin ? { preset: twin } : {}),
    };
  });
}

/**
 * Flip one path about a vertical line, rather than about the middle of the
 * field. What a single run needs: the start stays where it is and everything
 * after it goes the other way, leaving the rest of the play untouched.
 */
export function mirrorAbout(path: PathPoint[], axisX: number): PathPoint[] {
  return path.map((p) => ({
    x: 2 * axisX - p.x,
    y: p.y,
    ...(p.cx !== undefined ? { cx: 2 * axisX - p.cx } : {}),
    ...(p.cy !== undefined ? { cy: p.cy } : {}),
    ...(p.w !== undefined ? { w: p.w } : {}),
  }));
}

export function mirrorAnnotations(annotations: PathPoint[][]): PathPoint[][] {
  return annotations.map((path) => path.map(flipPoint));
}

/**
 * Zones flip with the field, because that is what they are: a deep third on the
 * left is the deep third on the right when the play is turned round, and the
 * man it belongs to has been mirrored with it. Sizes are untouched — a mirrored
 * third is still a third.
 */
export function mirrorZones(zones: Zone[]): Zone[] {
  return zones.map((z) => ({ ...z, x: -z.x }));
}
