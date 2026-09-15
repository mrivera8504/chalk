import {
  PLAYER_R,
  isLinkKind,
  type Assignment,
  type PathPoint,
  type PlayerSlot,
} from '../types';

/**
 * The defensive lines that are stored as who-does-what-to-whom.
 *
 * Man coverage and a line game are both facts about two players, so neither
 * stores its geometry — the path is rebuilt from both men on every render, the
 * way a block is. Drag the receiver and the coverage line follows him; swap the
 * front underneath and the stunt redraws between whoever is there now. Storing
 * the drawn line instead would leave a defender covering the grass a receiver
 * used to be standing on.
 */

/** Both ends clear the marks, exactly as the block geometry does. */
const GAP = PLAYER_R + 0.06;
const MIN_STEM = 0.2;

/** How far behind his own alignment a looper swings before coming through. */
const LOOP_DEPTH = 1.1;
/** How far past the line a stunt finishes. Shallower than a blitz: it is slower. */
const THROUGH = 1.4;
/**
 * How far past his partner each man aims, as a fraction of the space between
 * them.
 *
 * Not at the partner's own alignment, which is where the first version put
 * them: two men 1.8 yards apart both finished on top of the offensive lineman
 * one of them was lined up over, so the exchange drew as two arrows through a
 * blocker instead of through the gaps either side of him. Crossing his face is
 * what a line game is.
 */
const PAST = 0.5;

function unit(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 1, len: 0 };
  return { x: dx / len, y: dy / len, len };
}

function trimmed(len: number): number {
  return len >= GAP * 2 + MIN_STEM ? GAP : Math.max(0, (len - MIN_STEM) / 2);
}

/**
 * Defender to the man he has. Straight, and drawn between the two marks rather
 * than through them, so a cover line across a crowded board still reads as
 * joining two players instead of passing behind a third.
 */
export function coverPath(defender: PlayerSlot, receiver: PlayerSlot): PathPoint[] {
  const u = unit(defender, receiver);
  const t = trimmed(u.len);
  return [
    { x: defender.x + u.x * t, y: defender.y + u.y * t },
    { x: receiver.x - u.x * t, y: receiver.y - u.y * t },
  ];
}

/**
 * The two halves of a line game.
 *
 * The crasher goes first and takes the looper's space; the looper gives ground,
 * comes round behind him and takes his. Drawing them as two paths rather than
 * one is not a compromise: they are two men's jobs, either of them can be
 * erased, and each has to keep following its own player when the front shifts.
 */
export function crashPath(crasher: PlayerSlot, partner: PlayerSlot): PathPoint[] {
  const span = partner.x - crasher.x;
  const to = partner.x + span * PAST;
  return [
    { x: crasher.x, y: crasher.y },
    { x: to, y: 0.2, cx: crasher.x + span * 0.5, cy: crasher.y * 0.6 },
    { x: to + span * 0.1, y: THROUGH },
  ];
}

export function loopPath(looper: PlayerSlot, partner: PlayerSlot): PathPoint[] {
  const span = partner.x - looper.x;
  const to = partner.x + span * PAST;
  const away = Math.sign(-span) || 1;
  return [
    { x: looper.x, y: looper.y },
    // Back off his alignment first — this is what makes it a loop rather than
    // two men running into each other in the same space.
    { x: looper.x + away * 0.4, y: looper.y - LOOP_DEPTH },
    { x: to, y: 0.2, cx: looper.x + span * 0.5, cy: looper.y - LOOP_DEPTH * 0.7 },
    { x: to + span * 0.1, y: THROUGH },
  ];
}

/** Which half of the stunt a line is. Kept in `preset`, which is what it is. */
export const CRASH = 'stunt-crash';
export const LOOP = 'stunt-loop';

let counter = 0;
const newId = () => `a${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makeCover(defender: PlayerSlot, receiver: PlayerSlot): Assignment {
  return {
    id: newId(),
    playerId: defender.id,
    kind: 'cover',
    path: coverPath(defender, receiver),
    targetPlayerId: receiver.id,
  };
}

/**
 * A stunt, as the pair of assignments it actually is. The first man tapped
 * crashes, which is the order it is called in: "tackle first, end around".
 */
export function makeStunt(first: PlayerSlot, second: PlayerSlot): Assignment[] {
  return [
    {
      id: newId(),
      playerId: first.id,
      kind: 'stunt',
      path: crashPath(first, second),
      targetPlayerId: second.id,
      preset: CRASH,
    },
    {
      id: newId(),
      playerId: second.id,
      kind: 'stunt',
      path: loopPath(second, first),
      targetPlayerId: first.id,
      preset: LOOP,
    },
  ];
}

/**
 * Rebuild every stored-as-a-relationship defensive line from its two players,
 * the twin of `refreshBlocks`. A line whose man has left the board goes with
 * him rather than pointing at nothing.
 */
export function refreshLinks(assignments: Assignment[], players: PlayerSlot[]): Assignment[] {
  const byId = new Map(players.map((p) => [p.id, p]));

  return assignments.flatMap((a) => {
    if (!isLinkKind(a.kind) || !a.targetPlayerId) return [a];

    const who = byId.get(a.playerId);
    const other = byId.get(a.targetPlayerId);
    if (!who || !other) return [];

    if (a.kind === 'cover') return [{ ...a, path: coverPath(who, other) }];
    return [{ ...a, path: a.preset === LOOP ? loopPath(who, other) : crashPath(who, other) }];
  });
}

/** The other half of a stunt, so erasing one end takes the whole line game. */
export function stuntPartner(a: Assignment, assignments: Assignment[]): Assignment | null {
  if (a.kind !== 'stunt') return null;
  return (
    assignments.find(
      (b) => b.id !== a.id && b.playerId === a.targetPlayerId && b.targetPlayerId === a.playerId,
    ) ?? null
  );
}
