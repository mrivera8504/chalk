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

/**
 * Square up the near-misses: a segment within `degrees` of flat goes flat, and
 * one within `degrees` of straight up goes straight up.
 *
 * Runs on the simplified points, before smoothing, so the corners it squares
 * are the ones a hand actually meant to turn at rather than pen wobble.
 */
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

/**
 * Settle the end of a route onto a yard line.
 *
 * Depth only. A route is called by how deep it goes — a twelve-yard out — and
 * that is the number worth landing on the round figure; where it finishes
 * across the field is wherever the receiver ran to. Squaring both would drag
 * the end of a sideline route a yard inboard for no reason anyone asked for.
 */
export function snapEnd(points: Yards[]): Yards[] {
  if (points.length < 2) return points;
  const out = points.map((p) => ({ ...p }));
  const last = out.length - 1;
  const settled = Math.round(out[last].y);
  // A segment already flat stays flat: moving one end of it alone would put a
  // kink into the very line straighten() just took the kink out of.
  if (Math.abs(out[last].y - out[last - 1].y) < 1e-9) out[last - 1].y = settled;
  out[last].y = settled;
  return out;
}

/**
 * How thick to draw a stroke, in yards, from how hard it was pressed.
 *
 * Taken from the hardest sample rather than averaged: contact on this digitizer
 * is mostly hover at zero, and a mean over those would report every stroke as
 * feather-light. Clamped at both ends so the setting can never produce a line
 * too thin to see or thick enough to cover a player.
 */
export function widthFromPressure(pressures: number[]): number | undefined {
  const peak = pressures.reduce((hi, p) => (p > hi ? p : hi), 0);
  if (peak <= 0) return undefined;
  // 0.5 is a firm press on a working digitizer; this one rarely passes 0.13,
  // so the curve has to reach usable width well before the top of the range.
  const t = Math.min(1, peak / 0.35);
  return Number((0.11 + t * 0.16).toFixed(3));
}
