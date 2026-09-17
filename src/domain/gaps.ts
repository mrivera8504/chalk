import type { Hand, PlayerSlot } from './types';

/**
 * The gaps in the offensive line, lettered outward from the ball.
 *
 *     ...  D   C   B   A  [C]  A   B   C   D  ...
 *
 * The defensive twin of `computeHoles`, and computed the same way and for the
 * same reason: **never stored**. A gap is only ever "the space between those two
 * men", so shifting a tight end re-letters the front on its own, and mirroring a
 * play sends a C-gap blitz into the other C gap without anything being rewritten.
 *
 * Holes and gaps are not the same map and cannot share one. A hole is numbered
 * odd one way and even the other because the offense calls a direction with the
 * number; a gap is lettered identically on both sides because the defense calls
 * a direction separately from the space. So the hole between the center and the
 * right guard is 2 and the gap there is A, and both are right.
 */
export interface Gap {
  letter: string;
  /** The middle of the space, in yards from the middle of the field. */
  x: number;
  /** Which side of the ball it sits on. 'A' alone is ambiguous without it. */
  side: Hand;
}

const LETTERS = 'ABCDEFGH';

/** How far outside the last man on the line the outermost gap sits. */
const OUTSIDE = 1.6;

export function computeGaps(players: PlayerSlot[]): Gap[] {
  const line = players
    .filter((p) => p.side === 'offense' && p.onLine)
    .sort((a, b) => a.x - b.x);

  if (line.length < 2) return [];

  // The center is whoever on the line sits closest to the middle, exactly as
  // the hole map decides it. Two maps disagreeing about where the ball is would
  // put a 2-hole and an A-gap in different places.
  let centerIdx = 0;
  for (let i = 1; i < line.length; i++) {
    if (Math.abs(line[i].x) < Math.abs(line[centerIdx].x)) centerIdx = i;
  }

  const gaps: Gap[] = [];

  // Out to the left of the center, one letter per space.
  let n = 0;
  for (let i = centerIdx; i > 0; i--) {
    gaps.push({ letter: LETTERS[n] ?? '?', x: (line[i].x + line[i - 1].x) / 2, side: 'left' });
    n++;
  }
  gaps.push({ letter: LETTERS[n] ?? '?', x: line[0].x - OUTSIDE, side: 'left' });

  // And out to the right.
  n = 0;
  for (let i = centerIdx; i < line.length - 1; i++) {
    gaps.push({ letter: LETTERS[n] ?? '?', x: (line[i].x + line[i + 1].x) / 2, side: 'right' });
    n++;
  }
  gaps.push({ letter: LETTERS[n] ?? '?', x: line[line.length - 1].x + OUTSIDE, side: 'right' });

  return gaps.sort((a, b) => a.x - b.x);
}

/**
 * The gap a blitzer aiming from here would be going through.
 *
 * Nearest wins, which is the same rule the board uses for picking anything:
 * "the A gap" from a man head-up on the guard is whichever A he is closer to.
 */
export function nearestGap(gaps: Gap[], x: number): Gap | null {
  if (!gaps.length) return null;
  return gaps.reduce((best, g) => (Math.abs(g.x - x) < Math.abs(best.x - x) ? g : best));
}

/**
 * A named gap on a named side, for a preset that says which one it wants.
 *
 * Falls back to the nearest gap of that letter on either side, and then to
 * nothing: a front with a short line may genuinely have no C gap, and a blitz
 * that silently aimed at the wrong space would be worse than one that aims
 * straight ahead.
 */
export function findGap(gaps: Gap[], letter: string, hand: Hand): Gap | null {
  return (
    gaps.find((g) => g.letter === letter && g.side === hand) ??
    gaps.find((g) => g.letter === letter) ??
    null
  );
}

/** The gap letter to show over a spot, for the on-board gap map. */
export function gapLabel(gap: Gap): string {
  return gap.letter;
}
