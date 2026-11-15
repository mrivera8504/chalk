import type { EditorCtx } from './context';
import { insideFocus } from '../../render/FocusSquare';
import { insideCone } from '../../render/VisionCone';
import { insideZone, onCorner, zoneCorner } from '../../render/Zone';
import { type Yards } from '../../render/geometry';
import { ROUTE_GRAB, VISION_ID, type DragState } from '../gesture';

/** The things on the board that are picked up by something other than a mark. */

export function createGrab(ed: EditorCtx) {
  const {
    byId,
    focuses,
    qb,
    routeHandles,
    vision,
    zones,
  } = ed;

  /** The handle, if the tap is within reach of it. */
  function grabRoutePoint(at: Yards, radius: number): DragState | null {
    let best: (typeof routeHandles)[number] | null = null;
    let bestD = Math.max(radius, ROUTE_GRAB);
    for (const h of routeHandles) {
      const d = Math.hypot(h.x - at.x, h.y - at.y);
      if (d <= bestD) {
        best = h;
        bestD = d;
      }
    }
    if (!best) return null;
    return {
      kind: 'route-point',
      id: best.id,
      pt: best.pt,
      dx: best.x - at.x,
      dy: best.y - at.y,
      ox: at.x,
      oy: at.y,
      moved: false,
    };
  }

  /**
   * A tap inside one of the highlights, which are their own grab handles.
   *
   * Neither has anything to aim at on purpose: a handle out at the far end read
   * as another player among the routes, and the wash is a far bigger target,
   * which is what this stylus needs — Chrome hit-tests it at the exact pixel.
   *
   * Reached only once the players and the lines have had their turn, so a
   * highlight spread across the backfield can never be what a tap on the man
   * standing in it picks up. The squares go first: they are small and placed
   * deliberately, where the cone is a wide wash that would swallow them.
   */
  function grabHighlight(at: Yards): DragState | null {
    const base = { ox: at.x, oy: at.y, moved: false };

    /*
     * Corners before bodies, and zones before either highlight.
     *
     * A corner is a small deliberate target sitting on top of the box it sizes,
     * so it has to be asked first or it could never be hit at all. Then the
     * boxes: a zone is placed where a coach put it, where the cone is a wide
     * wash across the whole backfield that would otherwise swallow anything
     * lying inside it. Same argument the squares already won against the cone.
     */
    for (const z of zones) {
      if (!onCorner(z, at)) continue;
      const c = zoneCorner(z);
      return { kind: 'zone-size', id: z.playerId, dx: c.x - at.x, dy: c.y - at.y, ...base };
    }

    for (const z of zones) {
      if (!insideZone(z, at)) continue;
      // Grab it by its middle, so the box keeps its position under the pen
      // instead of jumping its center to wherever the tap landed.
      return { kind: 'zone', id: z.playerId, dx: z.x - at.x, dy: z.y - at.y, ...base };
    }

    for (const f of focuses) {
      const man = byId(f.playerId);
      if (!man || !insideFocus(man, f, at)) continue;
      // Drag from the far end, not from where the tap landed, or grabbing the
      // near edge would collapse the square onto the pen.
      return {
        kind: 'focus',
        id: f.playerId,
        dx: man.x + f.dx - at.x,
        dy: man.y + f.dy - at.y,
        ...base,
      };
    }

    // Not drawn without a quarterback, and a cone you cannot see is one you
    // cannot mean to grab.
    if (vision && qb && insideCone(qb, vision, at)) {
      return {
        kind: 'vision',
        id: VISION_ID,
        // Swing it from where the focus is, not from where the tap landed, or
        // grabbing the wide part of the wash would snap the look sideways.
        dx: vision.x - at.x,
        dy: vision.y - at.y,
        ...base,
      };
    }

    return null;
  }

  return { grabRoutePoint, grabHighlight };
}

export type Grab = ReturnType<typeof createGrab>;
