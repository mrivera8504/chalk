import { PITCH } from '../../sports/soccer/pitch';
import type { Hand, PathPoint, PlayerSlot } from '../types';
import type { RoutePreset } from './routes';

/*
 * What a soccer player is told to do off the ball and on it.
 *
 * Functions of where he stands and which goal he is attacking. The team in
 * possession goes up the board and the other team comes down it, so "forward"
 * is read off his side rather than written as a direction — the same run from
 * a striker and from the center back marking him goes opposite ways.
 */

const side = (hand: Hand) => (hand === 'right' ? 1 : -1);
const fwd = (s: PlayerSlot) => (s.side === 'offense' ? -1 : 1);
const from = (s: PlayerSlot): PathPoint => ({ x: s.x, y: s.y });
/** Kept on the pitch: a run drawn off the end of it is a run nobody makes. */
const on = (p: PathPoint): PathPoint => ({
  ...p,
  x: Math.max(-PITCH.halfWidth + 0.6, Math.min(PITCH.halfWidth - 0.6, p.x)),
  y: Math.max(-PITCH.halfLength + 0.8, Math.min(PITCH.halfLength - 0.8, p.y)),
});

export const SOCCER_ACTIONS: RoutePreset[] = [
  // ---- off the ball -------------------------------------------------------
  {
    id: 'soccer-through',
    name: 'Through',
    group: 'cut',
    shape: (s) => [from(s), on({ x: s.x, y: s.y + fwd(s) * 6 })],
  },
  {
    id: 'soccer-diagonal',
    name: 'Diagonal',
    group: 'cut',
    shape: (s, h) => [from(s), on({ x: s.x + side(h) * 3.2, y: s.y + fwd(s) * 5 })],
  },
  {
    // Round the outside of the man on the ball and on up the line.
    id: 'soccer-overlap',
    name: 'Overlap',
    group: 'cut',
    shape: (s, h) => [
      from(s),
      on({ x: s.x + side(h) * 2.4, y: s.y + fwd(s) * 7, cx: s.x + side(h) * 3.2, cy: s.y + fwd(s) * 1.5 }),
    ],
  },
  {
    // Back toward the ball to receive it to feet.
    id: 'soccer-check',
    name: 'Check',
    group: 'cut',
    shape: (s) => [from(s), on({ x: s.x, y: s.y - fwd(s) * 3 })],
  },
  {
    id: 'soccer-wide',
    name: 'Wide',
    group: 'cut',
    shape: (s, h) => [from(s), on({ x: s.x + side(h) * 4.5, y: s.y + fwd(s) * 1 })],
  },
  {
    // Into the area he is attacking, level with the penalty spot.
    id: 'soccer-box',
    name: 'Box',
    group: 'cut',
    shape: (s, h) => [from(s), { x: side(h) * 1.6, y: fwd(s) * (PITCH.halfLength - PITCH.spot) }],
  },

  // ---- on the ball --------------------------------------------------------
  {
    id: 'soccer-carry',
    name: 'Forward',
    group: 'dribble',
    line: 'dribble',
    shape: (s) => [from(s), on({ x: s.x, y: s.y + fwd(s) * 5 })],
  },
  {
    id: 'soccer-inside',
    name: 'Inside',
    group: 'dribble',
    line: 'dribble',
    shape: (s, h) => [from(s), on({ x: s.x - side(h) * 3, y: s.y + fwd(s) * 4 })],
  },
  {
    id: 'soccer-outside',
    name: 'Outside',
    group: 'dribble',
    line: 'dribble',
    shape: (s, h) => [from(s), on({ x: s.x + side(h) * 3, y: s.y + fwd(s) * 4 })],
  },
];
