import { endOf } from './moves';
import { refreshPaths } from './regenerate';
import type { Assignment, PathPoint, Play, PlayerSlot } from './types';

/**
 * One step of a play: where everybody is, and what each of them does next.
 *
 * A play was always exactly one of these — the men, their lines, the ink and
 * who has the ball — written straight onto the play. It still is. The steps
 * after the first are kept in `Play.frames`, so a play with no `frames` is a
 * play with one step, which is every play saved before there were steps, and
 * anything that reads a play without knowing about them (the card, the printed
 * sheet, a build from before this) draws the first step exactly as it always
 * drew the play.
 *
 * Zones, the cone and the focus squares are not in here. They are washes under
 * the whole play and stay on the play itself.
 */
export interface Frame {
  players: PlayerSlot[];
  assignments: Assignment[];
  annotations: PathPoint[][];
  /** Left out, never undefined, when nobody has it: Firestore refuses undefined. */
  ballCarrierId?: string;
}

/** Every step of a play, the first included. Never empty. */
export function framesOf(play: Play): Frame[] {
  return [
    {
      players: play.players,
      assignments: play.assignments,
      annotations: play.annotations,
      ...(play.ballCarrierId ? { ballCarrierId: play.ballCarrierId } : {}),
    },
    ...(play.frames ?? []),
  ];
}

/** A play with these steps: the first written onto it, the rest behind it. */
export function withFrames(play: Play, frames: Frame[]): Play {
  const [first, ...rest] = frames;
  const { frames: _was, ...bare } = play;
  return {
    ...bare,
    players: first.players,
    assignments: first.assignments,
    annotations: first.annotations,
    ballCarrierId: first.ballCarrierId,
    ...(rest.length ? { frames: rest } : {}),
  };
}

/**
 * The step that follows this one, before a coach has drawn anything on it.
 *
 * Everybody stands where their line left them, and nobody has a line yet. The
 * ball is with whoever it was passed to: a pass by the man who has it moves
 * it, and anything else leaves it where it was. A shot does not — the ball is
 * in the air, and what happens next is the coach's to draw.
 */
export function nextFrame(frame: Frame): Frame {
  // Rebuilt first: a screen or a block is stored as who-to-whom, and its path
  // is only as fresh as the last time something drew it.
  const lines = refreshPaths(frame.assignments, frame.players);
  const players = frame.players.map((p) => ({ ...p, ...endOf(p, lines) }));
  const pass = frame.assignments.find(
    (a) => a.kind === 'pass' && a.playerId === frame.ballCarrierId && a.targetPlayerId,
  );
  const ball = pass?.targetPlayerId ?? frame.ballCarrierId;
  return {
    players,
    assignments: [],
    annotations: [],
    ...(ball && players.some((p) => p.id === ball) ? { ballCarrierId: ball } : {}),
  };
}

/**
 * A play with steps as one play per step, for a sheet that prints them all.
 *
 * Each is the play standing as that step stands — its men, its lines, its ink,
 * who has the ball — with no steps of its own, named after the play and which
 * step it is. Its id carries the step so a page can tell the boards apart; it
 * is never saved. A play with one step comes back as itself.
 */
export function expandSteps(plays: Play[]): Play[] {
  return plays.flatMap((p) => {
    const steps = framesOf(p);
    if (steps.length < 2) return [p];
    const name = p.name || p.suggestedName || 'Untitled';
    return steps.map((f, i) => ({
      ...p,
      id: `${p.id}#${i + 1}`,
      name: `${name} · ${i + 1}/${steps.length}`,
      players: f.players,
      assignments: f.assignments,
      annotations: f.annotations,
      ballCarrierId: f.ballCarrierId,
      frames: undefined,
    }));
  });
}
