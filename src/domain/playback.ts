import { COURT } from '../sports/basketball/court';
import type { Frame } from './frames';
import { movementOf } from './moves';
import type { PlayerSlot } from './types';
import { pointAlong } from '../render/geometry';

/*
 * A play, run.
 *
 * Derived from the steps and never stored: there is nothing here a coach set,
 * only what the lines already say. Each man travels his own line in his own
 * step, at the pace that gets him to the end of it as the step ends — which is
 * how a play is taught, everybody arriving together, and not a claim about
 * anybody's forty time. A pass leaves the passer partway through the step and
 * is caught before it finishes; a shot leaves late and ends at the rim.
 */

/** How long each step runs, and how long it holds before the next. */
export const RUN_MS = 1500;
export const HOLD_MS = 500;
const STEP_MS = RUN_MS + HOLD_MS;

export interface Pose {
  /** Which step is on screen. */
  step: number;
  players: PlayerSlot[];
  /** Who has the ball, when it is in somebody's hands. */
  holder: string | null;
  /** Where the ball is, when it is in the air. */
  ball: { x: number; y: number } | null;
}

export function playbackLength(frames: Frame[]): number {
  return frames.length * STEP_MS;
}

/** Slow off the mark and slow into the spot, the way a body moves. */
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const within = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / (to - from)));

/** The window of a step a pass is in the air for, and a shot. */
const PASS = [0.3, 0.7] as const;
const SHOT = [0.62, 1] as const;

export function poseAt(frames: Frame[], ms: number): Pose {
  const step = Math.min(frames.length - 1, Math.max(0, Math.floor(ms / STEP_MS)));
  const frame = frames[step];
  const t = Math.min(1, Math.max(0, (ms - step * STEP_MS) / RUN_MS));
  const f = ease(t);

  const players = frame.players.map((p) => {
    const move = movementOf(frame.assignments, p.id);
    return move ? { ...p, ...pointAlong(move.path, f) } : p;
  });
  const at = (id: string | undefined) => players.find((p) => p.id === id);

  const had = frame.ballCarrierId ?? null;
  const pass = frame.assignments.find((a) => a.kind === 'pass' && a.playerId === had && a.targetPlayerId);
  const shot = frame.assignments.find((a) => a.kind === 'shot' && a.playerId === had);
  const from = at(had ?? undefined);

  if (from && pass) {
    const to = at(pass.targetPlayerId);
    if (to) {
      if (t >= PASS[1]) return { step, players, holder: to.id, ball: null };
      if (t > PASS[0]) {
        const k = within(t, PASS[0], PASS[1]);
        return { step, players, holder: null, ball: { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) } };
      }
    }
  } else if (from && shot && t > SHOT[0]) {
    const k = within(t, SHOT[0], SHOT[1]);
    return {
      step,
      players,
      holder: null,
      ball: { x: lerp(from.x, COURT.rim.x, k), y: lerp(from.y, COURT.rim.y, k) },
    };
  }
  return { step, players, holder: had, ball: null };
}
