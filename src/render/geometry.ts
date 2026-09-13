import type { PathPoint } from '../domain/types';

/** The visible window, in yards. Offense sits at the bottom driving up. */
export const VIEW = {
  halfWidth: 11,
  downfield: 20,
  behind: 10,
};

export const VIEW_BOX = [
  -VIEW.halfWidth,
  -VIEW.downfield,
  VIEW.halfWidth * 2,
  VIEW.downfield + VIEW.behind,
].join(' ');

export interface Yards {
  x: number;
  y: number;
}

/**
 * Screen pixels to field yards. Uses the SVG's own transform matrix so this
 * stays correct under any CSS scaling, rotation or device pixel ratio without
 * tracking layout ourselves.
 */
export function toYards(svg: SVGSVGElement, clientX: number, clientY: number): Yards {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

export function snap(value: number, step = 0.25): number {
  return Math.round(value / step) * step;
}

/**
 * Depth snap, with a magnet on the line.
 *
 * The grid alone leaves linemen sitting a notch high or low, which reads as a
 * sloppy line and, worse, as a deliberate off-ball split. Inside the magnet
 * there is only one sane answer, so take it.
 *
 * The magnet is a distance in yards, zero to switch it off, and it belongs
 * inside the on-line tolerance: a mark that snaps to the line was already going
 * to count as on it, so tidying the drawing never changes the legality count or
 * the hole map under the user's hand.
 */
export function snapDepth(y: number, magnetYards: number, step: number): number {
  if (magnetYards > 0 && Math.abs(y) <= magnetYards) return 0;
  return snap(y, step);
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Points to an SVG path. A point carrying a control point becomes a quadratic
 * segment. Coordinates are trimmed because these strings go straight into
 * exported SVG and PDF later.
 */
export function toPathD(points: PathPoint[]): string {
  if (!points.length) return '';
  const n = (v: number) => Number(v.toFixed(3));

  let d = `M ${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    d +=
      p.cx !== undefined && p.cy !== undefined
        ? ` Q ${n(p.cx)} ${n(p.cy)} ${n(p.x)} ${n(p.y)}`
        : ` L ${n(p.x)} ${n(p.y)}`;
  }
  return d;
}

/**
 * Direction of travel arriving at points[i], for placing a cap or an arrowhead.
 * A curved segment is headed at by its control point, which is where the
 * tangent actually comes from.
 */
export function headingInto(points: PathPoint[], i: number): Yards {
  const p = points[i];
  const prev = points[i - 1];
  if (!p || !prev) return { x: 0, y: -1 };

  const fromX = p.cx ?? prev.x;
  const fromY = p.cy ?? prev.y;
  const dx = p.x - fromX;
  const dy = p.y - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: -1 };
  return { x: dx / len, y: dy / len };
}

/*
 * Slop around a player mark, in screen pixels, at any board scale.
 *
 * Sized from a device trace rather than guessed. Every failed tap in that
 * capture fell within 0.19 yards of the old 26px threshold, three of them
 * reaching for the same quarterback, so the marks were very slightly out of
 * reach rather than badly mis-aimed. 36px clears the worst of them with margin.
 * Over-reaching costs little, because the pick is nearest-wins: a wider radius
 * covers more players but still returns the closest one.
 */
const PICK_PX = 36;

/** Screen pixels to yards at whatever scale the board is currently drawn. */
export function pxToYards(svg: SVGSVGElement, px: number): number {
  const ctm = svg.getScreenCTM();
  const perYard = ctm ? Math.abs(ctm.a) : 20;
  return px / perYard;
}

/**
 * How close a tap has to land, in yards. Derived from the live screen scale so
 * the target stays the same physical size whether the board is drawn on a phone
 * or a tablet.
 */
export function pickRadius(svg: SVGSVGElement): number {
  return Math.max(1.1, pxToYards(svg, PICK_PX));
}

/**
 * Nearest player to a point, rather than whichever element the browser happens
 * to hit-test. Chrome applies touch adjustment to a finger but hit-tests a
 * stylus at the exact pixel, so a mark a finger grabs on the first try needs
 * the pen placed dead on it. Nearest-wins also settles the overlap between
 * linemen at a tight split, which a fattened hit area cannot.
 */
export function nearestPlayer<T extends { x: number; y: number }>(
  players: T[],
  at: Yards,
  radius: number,
): T | null {
  let best: T | null = null;
  let bestD = radius;

  for (const p of players) {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function segmentDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Shortest distance from a point to an assignment path, in yards. Curves are
 * walked in a few steps rather than solved: this decides whether a tap landed
 * on a block line, and a quarter yard of approximation is invisible there.
 */
export function distanceToPath(points: PathPoint[], at: Yards): number {
  if (points.length < 2) return Infinity;
  let best = Infinity;
  let prev = points[0];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.cx !== undefined && p.cy !== undefined) {
      let last = prev;
      for (let t = 0.25; t <= 1.0001; t += 0.25) {
        const mt = 1 - t;
        const qx = mt * mt * prev.x + 2 * mt * t * p.cx + t * t * p.x;
        const qy = mt * mt * prev.y + 2 * mt * t * p.cy + t * t * p.y;
        best = Math.min(best, segmentDistance(last.x, last.y, qx, qy, at.x, at.y));
        last = { x: qx, y: qy };
      }
    } else {
      best = Math.min(best, segmentDistance(prev.x, prev.y, p.x, p.y, at.x, at.y));
    }
    prev = p;
  }
  return best;
}

/** Nearest assignment to a tap, so block lines are pickable without the DOM. */
export function nearestAssignment<T extends { path: PathPoint[] }>(
  list: T[],
  at: Yards,
  radius: number,
): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const a of list) {
    const d = distanceToPath(a.path, at);
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
