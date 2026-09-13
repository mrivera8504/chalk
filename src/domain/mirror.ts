import type { Assignment, PathPoint, PlayerSlot } from './types';

const flipPoint = (p: PathPoint): PathPoint => ({
  x: -p.x,
  y: p.y,
  ...(p.cx !== undefined ? { cx: -p.cx } : {}),
  ...(p.cy !== undefined ? { cy: p.cy } : {}),
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

export function mirrorAssignments(assignments: Assignment[]): Assignment[] {
  return assignments.map((a) => ({ ...a, path: a.path.map(flipPoint) }));
}

export function mirrorAnnotations(annotations: PathPoint[][]): PathPoint[][] {
  return annotations.map((path) => path.map(flipPoint));
}
