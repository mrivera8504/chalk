import type { PathPoint } from './types';

/** A stroke needs two points to be a line. One left over is nothing at all. */
const MIN_RUN = 2;

/**
 * Rub out every part of every stroke that falls within `radius` of a point.
 *
 * Partial, not whole: a pass through the middle of a stroke leaves the two ends
 * behind as separate strokes, which is what an eraser does and the reason the
 * annotation layer is stored as a list of paths rather than one.
 *
 * Returns null when nothing was touched. This runs on every pointer move while
 * the eraser is live, and a new array each time would re-render the board and
 * push an identical annotation set into the play on every sample.
 */
export function eraseAt(
  strokes: PathPoint[][],
  at: { x: number; y: number },
  radius: number,
): PathPoint[][] | null {
  const out: PathPoint[][] = [];
  let touched = false;

  for (const stroke of strokes) {
    let run: PathPoint[] = [];

    for (const p of stroke) {
      if (Math.hypot(p.x - at.x, p.y - at.y) <= radius) {
        touched = true;
        if (run.length >= MIN_RUN) out.push(run);
        run = [];
        continue;
      }
      /*
       * A control point describes the curve arriving from the point before it.
       * When a run starts partway through a stroke that point is gone, so the
       * curve would be drawn from wherever the new first point happens to be
       * and swing off across the field. Straighten the joint instead.
       */
      if (run.length === 0 && (p.cx !== undefined || p.cy !== undefined)) {
        const { cx: _cx, cy: _cy, ...rest } = p;
        run.push(rest);
      } else {
        run.push(p);
      }
    }

    if (run.length >= MIN_RUN) out.push(run);
  }

  return touched ? out : null;
}
