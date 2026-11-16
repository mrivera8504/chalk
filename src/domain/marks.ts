/**
 * Things put on the board that are not players: equipment, and a few words.
 *
 * What turns a play into a drill. A cone to run round, a goal to shoot at, a
 * ladder, a dummy to hit, and a label to say "start here" — on any surface, in
 * any sport. They sit on the play beside its zones and its cone, not inside a
 * step: a cone does not move between one step and the next, and a drill with
 * six steps would otherwise carry six copies of the same ten cones.
 *
 * Positions are in board yards like everything else. There is no size and no
 * rotation: a mark is a symbol, not a survey, and two more handles on every
 * cone would be two more things to pick up by accident with a pen.
 */
export type MarkKind = 'cone' | 'goal' | 'ladder' | 'dummy' | 'hoop' | 'label';

export interface BoardMark {
  id: string;
  kind: MarkKind;
  x: number;
  y: number;
  /** What a label says. Nothing else has words. */
  text?: string;
}

export const MARK_NAMES: Record<MarkKind, string> = {
  cone: 'Cone',
  goal: 'Goal',
  ladder: 'Ladder',
  dummy: 'Dummy',
  hoop: 'Hoop',
  label: 'Label',
};

/** How near a tap has to land to mean this mark, in yards. Pen-sized. */
export const MARK_REACH = 0.95;

/** The mark under a point, nearest first, or null. */
export function markAt(marks: BoardMark[], at: { x: number; y: number }, reach = MARK_REACH): BoardMark | null {
  let best: BoardMark | null = null;
  let bestD = reach;
  for (const m of marks) {
    const d = Math.hypot(m.x - at.x, m.y - at.y);
    if (d <= bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** Flip sides: a mark is a piece of the board, so it mirrors with the board. */
export function mirrorMarks(marks: BoardMark[]): BoardMark[] {
  return marks.map((m) => ({ ...m, x: -m.x }));
}

/**
 * Where a new mark goes: the middle of what is on screen, stepped along so the
 * third cone does not land exactly on the first two and look like one.
 */
export function placeFor(marks: BoardMark[], center: { x: number; y: number }): { x: number; y: number } {
  for (let i = 0; i < 40; i++) {
    const at = { x: center.x + ((i % 5) - 2) * 1.5, y: center.y + Math.floor(i / 5) * 1.5 };
    if (!marks.some((m) => Math.hypot(m.x - at.x, m.y - at.y) < 1)) return at;
  }
  return center;
}
