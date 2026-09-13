import { computeHoles, nearestHole } from './holes';
import { routeById } from './presets/routes';
import type { Assignment, PathPoint, Play, PlayerSlot, Settings } from './types';

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
 * Back number and hole, combined. Back 2 through hole 6 gives '26', plus the
 * concept if one was used: '26 Sweep'. Always a suggestion, never applied over
 * a name the user typed.
 */
export function suggestName(
  players: PlayerSlot[],
  assignments: Assignment[],
  settings: Settings,
): Suggestion | null {
  const carries = assignments.filter((a) => a.kind === 'carry' || carriesBall(a));
  if (carries.length !== 1) return null;

  const run = carries[0];
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
  const s = suggestName(play.players, play.assignments, settings);
  return {
    ...play,
    suggestedName: s?.name,
    backNumber: s?.backNumber,
    hole: s?.hole,
  };
}
