import type { PathPoint } from '../domain/types';
import type { Yards } from './geometry';

/**
 * Ramer-Douglas-Peucker. A pen at 240Hz puts down a few hundred points in a
 * second, most of them describing a straight line; this drops the ones that
 * carry no shape. Iterative rather than recursive, because a long stroke would
 * otherwise nest a stack frame per split.
 */
export function simplify(points: Yards[], tolerance = 0.15): Yards[] {
  if (points.length < 3) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    const a = points[first];
    const b = points[last];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);

    let worst = 0;
    let worstAt = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      // Distance from the chord, or from the endpoint if the chord is a dot.
      const d =
        len < 1e-9
          ? Math.hypot(p.x - a.x, p.y - a.y)
          : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }

    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = 1;
      stack.push([first, worstAt], [worstAt, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * Midpoint smoothing. Each retained point becomes the control of a quadratic
 * that runs between the midpoints either side of it, so the corners RDP left
 * behind round off into the curve a hand actually drew.
 */
export function toSmoothPath(points: Yards[]): PathPoint[] {
  if (points.length < 2) return [];
  if (points.length === 2) return [{ ...points[0] }, { ...points[1] }];

  const out: PathPoint[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    out.push({ x: (p.x + next.x) / 2, y: (p.y + next.y) / 2, cx: p.x, cy: p.y });
  }
  out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
  return out;
}

/** Snap an endpoint to the nearest yard, and square up near-straight segments. */
export function straighten(points: Yards[], degrees = 8): Yards[] {
  if (points.length < 2) return points;
  const out = points.map((p) => ({ ...p }));
  const limit = Math.tan((degrees * Math.PI) / 180);

  for (let i = 1; i < out.length; i++) {
    const dx = out[i].x - out[i - 1].x;
    const dy = out[i].y - out[i - 1].y;
    if (Math.abs(dx) > 1e-9 && Math.abs(dy / dx) < limit) out[i].y = out[i - 1].y;
    else if (Math.abs(dy) > 1e-9 && Math.abs(dx / dy) < limit) out[i].x = out[i - 1].x;
  }
  return out;
}
