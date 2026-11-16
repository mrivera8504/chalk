import type { PlayerSlot } from '../types';

/*
 * The three kinds of man a formation is written out of, and the counter that
 * numbers them. Here rather than beside the 7-man sets so the other kinds of
 * football can be written in the same words without importing the file that
 * has to import them back.
 */

let counter = 0;
export const slotId = (prefix: string) => `${prefix}-${++counter}`;

/** An offensive man on the line of scrimmage. */
export function lineman(label: string, x: number): PlayerSlot {
  return { id: slotId('o'), label, side: 'offense', x, y: 0, onLine: true, onLineLocked: false, shape: 'square' };
}

/** An offensive man off the line. Back number 1 is the quarterback, 2 the runner. */
export function back(label: string, x: number, y: number, backNumber?: number): PlayerSlot {
  return {
    id: slotId('o'),
    label,
    side: 'offense',
    x,
    y,
    onLine: false,
    onLineLocked: false,
    backNumber,
    shape: 'circle',
  };
}

/** A defender. ✕ up on the ball, triangle off it — the convention every front keeps. */
export function defender(label: string, x: number, y: number, up = false): PlayerSlot {
  return {
    id: slotId('d'),
    label,
    side: 'defense',
    x,
    y,
    onLine: false,
    onLineLocked: false,
    shape: up ? 'x' : 'triangle',
  };
}

/**
 * A front, built from two rows of numbers.
 *
 * Fronts are named by how many men are in each row — 5-2, 6-1 — so that is what
 * they are written as here, and the marks follow the same convention the default
 * defense set: ✕ on the line, triangle off it. Nothing is anchored to an
 * offensive player, deliberately. A front is where these men stand; who they
 * end up shaded on is the coach's next drag, and the gap map re-letters itself
 * around wherever they finish.
 */
export function front(down: number[], off: { label: string; x: number; y: number }[]): PlayerSlot[] {
  const middle = (down.length - 1) / 2;
  // Off the ball by more than two marks' worth, so a nose head-up on the
  // center draws as two players rather than as one smudge.
  // A man head-up on the center is the nose; everyone inside the ends is a tackle.
  const onBall = down.map((x, i) => defender(i === middle ? 'N' : 'T', x, -1.7, true));

  // The outside men on the line are ends, whatever the count is.
  if (onBall.length > 1) {
    onBall[0].label = 'E';
    onBall[onBall.length - 1].label = 'E';
  }

  return [...onBall, ...off.map((o) => defender(o.label, o.x, o.y))];
}
