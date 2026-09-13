import {
  PLAYER_R,
  isBlockKind,
  type Assignment,
  type BlockKind,
  type PathPoint,
  type PlayerSlot,
} from '../types';

/**
 * Both ends clear the player marks, so the line emerges from the blocker's edge
 * and the T-cap lands on the defender's near edge instead of underneath him.
 * The assignment layer sits below the players; anything inside a mark is gone.
 */
const START_GAP = PLAYER_R + 0.04;
const END_GAP = PLAYER_R + 0.04;
/** Head-up on a down lineman leaves under a quarter yard. Keep this much stem. */
const MIN_STEM = 0.18;
/** How far behind the LOS a puller runs. */
const PULL_DEPTH = 1.5;

interface Vec {
  x: number;
  y: number;
  len: number;
}

function toward(from: PathPoint, to: PathPoint): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  // Two players stacked on the same spot: point upfield rather than divide by zero.
  if (len < 1e-6) return { x: 0, y: -1, len: 0 };
  return { x: dx / len, y: dy / len, len };
}

/**
 * Shrink both gaps together when the two men are close enough that clearing
 * both marks would leave no line at all. A defender head-up on a guard is only
 * 1.7 yards away, which is most of a block on a real play.
 */
function gaps(len: number): [number, number] {
  const total = START_GAP + END_GAP;
  if (total + MIN_STEM <= len) return [START_GAP, END_GAP];
  const k = Math.max(0, len - MIN_STEM) / total;
  return [START_GAP * k, END_GAP * k];
}

/** Blocker to defender, straight, with the cap sitting across the defender. */
export function baseBlockPath(blocker: PlayerSlot, target: PlayerSlot): PathPoint[] {
  const u = toward(blocker, target);
  const [start, end] = gaps(u.len);

  return [
    { x: blocker.x + u.x * start, y: blocker.y + u.y * start },
    { x: target.x - u.x * end, y: target.y - u.y * end },
  ];
}

/**
 * Drop off the line, run flat behind it, then turn up into the defender. The
 * depth is measured from the blocker, so a pulling back arcs behind a pulling
 * guard instead of through him. Every waypoint is scaled to how far the pull
 * actually travels: a fixed exit would overshoot a short pull and kink back.
 */
export function pullBlockPath(blocker: PlayerSlot, target: PlayerSlot): PathPoint[] {
  const dir = Math.sign(target.x - blocker.x) || 1;
  const span = Math.abs(target.x - blocker.x);
  const depth = Math.max(blocker.y, 0) + PULL_DEPTH;
  const exit = Math.min(1.3, span * 0.45);
  const lane = target.x - dir * Math.min(1.1, span * 0.35);

  const path: PathPoint[] = [
    { x: blocker.x, y: blocker.y + START_GAP },
    // out of the stance and down into the lane
    { x: blocker.x + dir * exit, y: depth, cx: blocker.x + dir * exit * 0.25, cy: depth },
  ];

  // The flat run only exists if there is room for it between the two men.
  if ((lane - path[1].x) * dir > 0.05) path.push({ x: lane, y: depth });

  // Turn up, arriving from behind the defender.
  path.push({
    x: target.x - dir * 0.2,
    y: target.y + END_GAP,
    cx: target.x - dir * 0.45,
    cy: depth,
  });

  return path;
}

/**
 * Double-team the down lineman, then climb. The cap lands on the first defender
 * and the climb leaves vertically before bending, which is how the second-level
 * track actually runs.
 */
export function comboBlockPath(
  blocker: PlayerSlot,
  target: PlayerSlot,
  climbTo: PlayerSlot,
): PathPoint[] {
  const [start, atTarget] = baseBlockPath(blocker, target);
  const u = toward(atTarget, climbTo);
  const [, end] = gaps(u.len);
  const tip = { x: climbTo.x - u.x * end, y: climbTo.y - u.y * end };

  return [start, atTarget, { ...tip, cx: atTarget.x, cy: (atTarget.y + tip.y) / 2 }];
}

export function blockPath(
  kind: BlockKind,
  blocker: PlayerSlot,
  target: PlayerSlot,
  climbTo?: PlayerSlot,
): PathPoint[] {
  if (kind === 'pull') return pullBlockPath(blocker, target);
  if (kind === 'combo' && climbTo) return comboBlockPath(blocker, target, climbTo);
  return baseBlockPath(blocker, target);
}

let counter = 0;
const newId = () => `a${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makeBlock(
  kind: BlockKind,
  blocker: PlayerSlot,
  target: PlayerSlot,
  climbTo?: PlayerSlot,
): Assignment {
  return {
    id: newId(),
    playerId: blocker.id,
    kind,
    path: blockPath(kind, blocker, target, climbTo),
    targetPlayerId: target.id,
    climbToPlayerId: kind === 'combo' ? climbTo?.id : undefined,
  };
}

/**
 * Blocks are stored as who-blocks-whom, so the drawn path is rebuilt from the
 * current positions on every frame. Drag a defender and his blocker follows him.
 * Assignments whose players are gone drop out.
 */
export function refreshBlocks(
  assignments: Assignment[],
  players: PlayerSlot[],
): Assignment[] {
  const byId = new Map(players.map((p) => [p.id, p]));

  return assignments.flatMap((a) => {
    if (!isBlockKind(a.kind) || !a.targetPlayerId) return [a];

    const blocker = byId.get(a.playerId);
    const target = byId.get(a.targetPlayerId);
    if (!blocker || !target) return [];

    const climbTo = a.climbToPlayerId ? byId.get(a.climbToPlayerId) : undefined;
    if (a.kind === 'combo' && !climbTo) return [];

    return [{ ...a, path: blockPath(a.kind, blocker, target, climbTo) }];
  });
}

/** 'LG blocks T', for the inspector. */
export function describeBlock(a: Assignment, players: PlayerSlot[]): string {
  const name = (id?: string) => players.find((p) => p.id === id)?.label ?? '?';
  const blocker = name(a.playerId);

  if (a.kind === 'pull') return `${blocker} pulls to ${name(a.targetPlayerId)}`;
  if (a.kind === 'combo')
    return `${blocker} combos ${name(a.targetPlayerId)} to ${name(a.climbToPlayerId)}`;
  return `${blocker} blocks ${name(a.targetPlayerId)}`;
}
