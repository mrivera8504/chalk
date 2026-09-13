import { computeHoles, nearestHole } from './holes';
import { routeById } from './presets/routes';
import { isBlockKind, type Assignment, type PathPoint, type Play, type PlayerSlot, type Settings } from './types';

/** Where a path crosses the line of scrimmage, going downfield. */
function crossingX(path: PathPoint[]): number | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.y > 0 && b.y <= 0) {
      const t = (a.y - 0) / (a.y - b.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  // Never crossed: a carrier bounced outside or was stopped short, so take the
  // deepest point as the aiming spot instead of giving up on a name.
  if (!path.length) return null;
  return path.reduce((best, p) => (p.y < best.y ? p : best), path[0]).x;
}

export interface Suggestion {
  name: string;
  backNumber?: number;
  hole?: number;
}

/**
 * The line the ball actually travels on.
 *
 * A starred man is the whole answer: the coach has said who is getting it, so
 * whatever he is running is the run, even when it was drawn as a plain route.
 * Without a star it falls back to reading the lines, which only names a play
 * when exactly one of them is a carry — two carries is a name nobody can
 * guess at.
 */
function ballPath(assignments: Assignment[], ballCarrierId?: string): Assignment | null {
  if (ballCarrierId) {
    const his = assignments.filter((a) => a.playerId === ballCarrierId && !isBlockKind(a.kind));
    if (his.length) return his[his.length - 1];
  }
  const carries = assignments.filter((a) => a.kind === 'carry' || carriesBall(a));
  return carries.length === 1 ? carries[0] : null;
}

/**
 * Back number and hole, combined. Back 2 through hole 6 gives '26', plus the
 * concept if one was used: '26 Sweep'. Always a suggestion, never applied over
 * a name the user typed.
 */
export function suggestName(
  players: PlayerSlot[],
  assignments: Assignment[],
  settings: Settings,
  ballCarrierId?: string,
): Suggestion | null {
  const run = ballPath(assignments, ballCarrierId);
  if (!run) return null;
  const carrier = players.find((p) => p.id === run.playerId);
  if (!carrier?.backNumber) return null;

  const holes = computeHoles(players, settings);
  const x = crossingX(run.path);
  const hole = x === null ? null : nearestHole(holes, x);
  if (!hole) return null;

  const concept = run.preset ? routeById(run.preset)?.name : null;
  const number = `${carrier.backNumber}${hole.number}`;

  return {
    name: concept ? `${number} ${concept}` : number,
    backNumber: carrier.backNumber,
    hole: hole.number,
  };
}

/** A preset run is a carry even when it was stored as a route. */
function carriesBall(a: Assignment): boolean {
  return a.preset ? (routeById(a.preset)?.carry ?? false) : false;
}

export function withSuggestion(play: Play, settings: Settings): Play {
  const s = suggestName(play.players, play.assignments, settings, play.ballCarrierId);
  return {
    ...play,
    suggestedName: s?.name,
    backNumber: s?.backNumber,
    hole: s?.hole,
  };
}
