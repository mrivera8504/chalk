import { computeGaps, nearestGap } from './gaps';
import { computeHoles, nearestHole } from './holes';
import { readFormations } from './presets/formations';
import { routeById } from './presets/routes';
import { isDeepZone } from './presets/zones';
import {
  isBlockKind,
  type Assignment,
  type PathPoint,
  type Play,
  type PlayerSlot,
  type Settings,
  type Zone,
} from './types';

/**
 * Where a path crosses the line of scrimmage, whichever way it is going.
 *
 * A blitz is named by the gap it goes through, not by the space the man
 * happens to be standing in: reading his alignment called an A-gap blitz from a
 * linebacker shaded outside the guard a B fire, which is the wrong call written
 * on the sheet. This is the same interpolation the offensive namer does, in the
 * other direction.
 */
function crossesLine(path: PathPoint[]): number | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.y < 0 && b.y >= 0) return a.x + (b.x - a.x) * (-a.y / (b.y - a.y));
  }
  // Never got there — a fit that stops short, or a man who was already past it.
  return path.length ? path[path.length - 1].x : null;
}

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

/**
 * What a defensive call is called: the front, the coverage, and the pressure.
 *
 * Read off the board rather than remembered, exactly as the offensive name is.
 * The coverage is counted from the deep zones actually drawn, so dragging a
 * safety down into the box stops the sheet calling it Cover 3 — which is what
 * has just happened on the field. The front is the only part that is looked up
 * rather than counted, because it is a name somebody chose.
 */
export function suggestDefenseName(
  players: PlayerSlot[],
  assignments: Assignment[],
  zones: Zone[],
  frontName?: string,
): Suggestion | null {
  const parts = [frontName, coverageName(zones, assignments), pressureName(players, assignments)];
  const name = parts.filter(Boolean).join(' ');
  return name ? { name } : null;
}

/**
 * What the drawing is calling itself.
 *
 * The deep zones are read by the concept they were built from rather than only
 * counted, because the count and the call are not the same thing: Cover 3
 * played with two deep men is still Cover 3 with a third of the field vacated,
 * and that is the play. Boxes drawn by hand have no concept behind them, so
 * those fall back to counting, which is the best anyone can do with them.
 */
function coverageName(zones: Zone[], assignments: Assignment[]): string | null {
  const man = assignments.filter((a) => a.kind === 'cover').length;
  const deepZones = zones.filter(isDeepZone);
  if (!deepZones.length) return man ? 'Cover 0' : null;

  const byPreset = (id: string) => deepZones.some((z) => z.preset === id);
  if (byPreset('third')) return 'Cover 3';
  if (byPreset('half')) return man ? '2 Man' : 'Cover 2';
  if (byPreset('middle')) return 'Cover 1';

  // Hand-drawn boxes: all there is to go on is how many of them are deep.
  const deep = deepZones.length;
  return deep === 1 ? 'Cover 1' : deep === 2 ? 'Cover 2' : deep === 3 ? 'Cover 3' : `${deep} Deep`;
}

/**
 * The pressure, if there is one. A single blitzer is called by his own name and
 * the gap he is going through, which is how it is called on a sideline; several
 * at once stops being a man's name and becomes a count.
 */
function pressureName(players: PlayerSlot[], assignments: Assignment[]): string | null {
  const gaps = computeGaps(players);
  const blitzers = assignments.flatMap((a) => {
    if (a.kind !== 'blitz' && a.kind !== 'contain') return [];
    const man = players.find((p) => p.id === a.playerId);
    // A man on the ball rushing is not a blitz, it is his job. Counting the
    // defensive line as pressure would call every play in the book a fire.
    return man && man.y < -2.6 ? [{ man, kind: a.kind, path: a.path }] : [];
  });

  if (!blitzers.length) {
    return assignments.some((a) => a.kind === 'stunt') ? 'Twist' : null;
  }
  if (blitzers.length > 1) return `${blitzers.length} Fire`;

  const [only] = blitzers;
  if (only.kind === 'contain') return `${only.man.label} Edge`;
  const at = crossesLine(only.path);
  const gap = at === null ? null : nearestGap(gaps, at);
  return gap ? `${only.man.label} ${gap.letter} Fire` : `${only.man.label} Fire`;
}

/** The front this play is wearing, by the name it was saved under. */
function frontName(play: Play): string | undefined {
  if (!play.defenseFormationId) return undefined;
  return readFormations().find((f) => f.id === play.defenseFormationId)?.name;
}

export function withSuggestion(play: Play, settings: Settings): Play {
  if (play.unit === 'defense') {
    const d = suggestDefenseName(
      play.players,
      play.assignments,
      play.zones ?? [],
      frontName(play),
    );
    // Back number and hole are an offensive play's coordinates. A defensive
    // play has neither, and leaving a stale pair behind would have the playbook
    // filing it under a hole it has nothing to do with.
    return { ...play, suggestedName: d?.name, backNumber: undefined, hole: undefined };
  }

  const s = suggestName(play.players, play.assignments, settings, play.ballCarrierId);
  return {
    ...play,
    suggestedName: s?.name,
    backNumber: s?.backNumber,
    hole: s?.hole,
  };
}
