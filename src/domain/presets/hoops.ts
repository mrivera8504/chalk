import { COURT } from '../../sports/basketball/court';
import { endOf, movementOf } from '../moves';
import { PLAYER_R, type Assignment, type Hand, type PathPoint, type PlayerSlot } from '../types';
import type { RoutePreset } from './routes';

/*
 * What a basketball player is told to do, in the words a coach uses for it.
 *
 * Functions of where the man is standing, exactly as a route is: a basket cut
 * from the wing and one from the top start in different places and are the
 * same instruction. Where a concept has a side — the corner, the wing, the
 * elbow — it takes it from the hand, so Flip sends him to the other one by
 * drawing it again rather than by mirroring a shape.
 */

const side = (hand: Hand) => (hand === 'right' ? 1 : -1);
const from = (s: PlayerSlot): PathPoint => ({ x: s.x, y: s.y });
const { rim } = COURT;

/** A step in front of the rim: where a cut or a drive finishes. */
const atRim = (hand: Hand, off = 0.5): PathPoint => ({ x: rim.x + side(hand) * off, y: rim.y + 1.1 });

/** The unit vector from the basket out to a man. */
function outward(s: PlayerSlot) {
  const dx = s.x - rim.x;
  const dy = s.y - rim.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

const SPOTS = {
  corner: (h: Hand) => ({ x: side(h) * 7.4, y: 1.6 }),
  wing: (h: Hand) => ({ x: side(h) * 6.9, y: 6.6 }),
  elbow: (h: Hand) => ({ x: side(h) * 2.2, y: COURT.lane.length + 0.1 }),
  block: (h: Hand) => ({ x: side(h) * 2.7, y: 2.9 }),
  top: () => ({ x: 0, y: 9.6 }),
};

const to =
  (spot: (h: Hand) => { x: number; y: number }) =>
  (s: PlayerSlot, h: Hand): PathPoint[] => [from(s), spot(h)];

export const HOOPS_ACTIONS: RoutePreset[] = [
  // ---- cuts ---------------------------------------------------------------
  { id: 'hoops-basket', name: 'Basket', group: 'cut', shape: (s, h) => [from(s), atRim(h, 0)] },
  {
    // A step out to sell it, then behind the defender to the rim.
    id: 'hoops-backdoor',
    name: 'Backdoor',
    group: 'cut',
    shape: (s, h) => {
      const o = outward(s);
      return [from(s), { x: s.x + o.x * 1.3, y: s.y + o.y * 1.3 }, atRim(h, 0.4)];
    },
  },
  {
    // In toward the basket, then back out past where he started to get open.
    id: 'hoops-vcut',
    name: 'V-cut',
    group: 'cut',
    shape: (s) => {
      const o = outward(s);
      return [
        from(s),
        { x: s.x - o.x * 2.6, y: s.y - o.y * 2.6 },
        { x: s.x + o.x * 1.2 + o.y * 1.2, y: s.y + o.y * 1.2 - o.x * 1.2 },
      ];
    },
  },
  {
    id: 'hoops-curl',
    name: 'Curl',
    group: 'cut',
    shape: (s, h) => {
      const e = SPOTS.elbow(h);
      return [from(s), { x: e.x, y: e.y - 1, cx: s.x, cy: e.y + 1.5 }];
    },
  },
  { id: 'hoops-flash', name: 'Flash', group: 'cut', shape: to(SPOTS.elbow) },
  { id: 'hoops-post', name: 'Post', group: 'cut', shape: to(SPOTS.block) },
  { id: 'hoops-corner', name: 'Corner', group: 'cut', shape: to(SPOTS.corner) },
  { id: 'hoops-wing', name: 'Wing', group: 'cut', shape: to(SPOTS.wing) },
  { id: 'hoops-top', name: 'Top', group: 'cut', shape: to(SPOTS.top) },

  // ---- with the ball ------------------------------------------------------
  { id: 'hoops-drive', name: 'Drive', group: 'dribble', line: 'dribble', shape: (s, h) => [from(s), atRim(h)] },
  {
    id: 'hoops-baseline',
    name: 'Baseline',
    group: 'dribble',
    line: 'dribble',
    shape: (s, h) => [from(s), { ...atRim(h, 1), cx: side(h) * 6, cy: 1.2 }],
  },
  { id: 'hoops-to-wing', name: 'To wing', group: 'dribble', line: 'dribble', shape: to(SPOTS.wing) },
  { id: 'hoops-to-top', name: 'To top', group: 'dribble', line: 'dribble', shape: to(SPOTS.top) },
];

/* ---- lines stored as who-to-whom, rebuilt from both men ------------------ */

/** Pull a segment's two ends in off the marks they join. */
function between(a: { x: number; y: number }, b: { x: number; y: number }, short: number): PathPoint[] {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  const gap = Math.min(short, d / 2.2);
  return [
    { x: a.x + ux * PLAYER_R, y: a.y + uy * PLAYER_R },
    { x: b.x - ux * gap, y: b.y - uy * gap },
  ];
}

/**
 * A pass, from where the ball is thrown to where it is caught.
 *
 * Thrown from where the passer stands, unless he dribbles first, when it
 * leaves from the end of the dribble. Caught where the receiver's cut ends if
 * he has one: getting open and then getting the ball is the commonest thing on
 * a court. Anything finer than that is a second step of the play.
 */
export function passPath(passer: PlayerSlot, receiver: PlayerSlot, all: Assignment[]): PathPoint[] {
  const carried = movementOf(all, passer.id);
  const start = carried?.kind === 'dribble' ? endOf(passer, all) : passer;
  const cut = movementOf(all, receiver.id);
  const end = cut?.kind === 'route' ? endOf(receiver, all) : receiver;
  return between(start, end, PLAYER_R + 0.15);
}

/** A screen: to the man it is set for, stopping a shoulder short of him. */
export function screenPath(screener: PlayerSlot, forWhom: PlayerSlot): PathPoint[] {
  return between(screener, forWhom, PLAYER_R * 2 + 0.2);
}

/** A shot: from wherever he ends up, to the rim. */
export function shotPath(shooter: PlayerSlot, all: Assignment[]): PathPoint[] {
  const at = endOf(shooter, all);
  const d = Math.hypot(rim.x - at.x, rim.y - at.y) || 1;
  return [
    { x: at.x + ((rim.x - at.x) / d) * PLAYER_R, y: at.y + ((rim.y - at.y) / d) * PLAYER_R },
    { x: rim.x, y: rim.y },
  ];
}

let counter = 0;
const newId = () => `h${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makePass(passer: PlayerSlot, receiver: PlayerSlot, all: Assignment[]): Assignment {
  return {
    id: newId(),
    playerId: passer.id,
    kind: 'pass',
    path: passPath(passer, receiver, all),
    targetPlayerId: receiver.id,
  };
}

export function makeScreen(screener: PlayerSlot, forWhom: PlayerSlot): Assignment {
  return {
    id: newId(),
    playerId: screener.id,
    kind: 'screen',
    path: screenPath(screener, forWhom),
    targetPlayerId: forWhom.id,
  };
}

export function makeShot(shooter: PlayerSlot, all: Assignment[]): Assignment {
  return { id: newId(), playerId: shooter.id, kind: 'shot', path: shotPath(shooter, all) };
}
