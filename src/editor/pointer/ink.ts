import type { EditorCtx } from './context';
import { nearestPlayer, toYards, yardsToPx, type Yards } from '../../render/geometry';
import { simplify, snapEnd, straighten, toSmoothPath, widthFromPressure } from '../../render/smooth';
import { getSettings } from '../../store/settings';
import { CHATTER_MS, INK_IDLE_MS, INK_MIN_SPAN, INK_OWNER_YARDS, INK_TOLERANCE } from '../gesture';
import { TRACING, describeEvent, trace } from '../trace';
import { type Aim } from './aim';

let inkCounter = 0;
const inkId = () => `k${Date.now().toString(36)}${(inkCounter++).toString(36)}`;

/**
 * Freehand. Contact only starts and finishes a stroke; its shape is wherever
 * the pen goes in between, on the glass or off it.
 */

export function createInk(ed: EditorCtx, aim: Aim) {
  const {
    byId,
    commitTimer,
    idleTimer,
    ink,
    lastPenAt,
    lastRawAt,
    rawBound,
    remember,
    setAnnotations,
    setAssignments,
    settings,
    stroke,
    strokeAt,
    strokeOwner,
    svgRef,
    tapGuard,
    visible,
  } = ed;
  const { showAim } = aim;

  /**
   * The stage owns hit testing rather than each player shape. Chrome applies
   * touch adjustment to a finger but hit-tests a stylus at the exact pixel, so
   * a mark a finger grabs first time needs the pen placed dead on it. Missing
   * used to land on the background and clear the selection, which is why a drag
   * appeared to deselect itself halfway.
   */
  /**
   * Palm rejection: ignore touch that lands while the pen is in play.
   *
   * Pen-only is the stronger version of the same rule, for a hand that rests on
   * the glass for longer than the 800ms window. It gates the ink tools alone —
   * `accepts` is not on the path that drags a player, and a finger has to go on
   * moving marks around whatever this is set to.
   */
  function accepts(e: React.PointerEvent | PointerEvent): boolean {
    if (e.pointerType === 'pen') {
      lastPenAt.current = performance.now();
      return true;
    }
    if (e.pointerType === 'touch') {
      if (getSettings().penOnly) return false;
      return performance.now() - lastPenAt.current > 800;
    }
    return true;
  }

  function extendStroke(e: React.PointerEvent | PointerEvent) {
    const pts = stroke.current;
    if (!pts || !accepts(e)) return;

    // One event per sample with raw updates; with plain moves the samples are
    // batched, so unpack them or the stroke corners off at speed.
    const native = 'getCoalescedEvents' in e ? (e as PointerEvent) : null;
    const batch = native?.getCoalescedEvents?.() ?? null;
    if (batch && batch.length > 1) {
      for (const c of batch) pts.push({ x: c.clientX, y: c.clientY, p: c.pressure });
    } else {
      pts.push({ x: e.clientX, y: e.clientY, p: e.pressure });
    }

    const ahead = (e as PointerEvent).getPredictedEvents?.() ?? [];
    // Preview at the width it will commit at, or the jump on release reads as
    // the app having changed its mind about the stroke.
    const svg = svgRef.current;
    const yards = getSettings().pressureWidth
      ? widthFromPressure(pts.map((q) => q.p ?? 0))
      : undefined;
    ink.current?.draw(
      pts,
      ahead.map((q) => ({ x: q.clientX, y: q.clientY })),
      yards && svg ? yardsToPx(svg, yards) : undefined,
    );

    // Any movement, hovering or not, keeps the stroke alive.
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(endStrokeWhenQuiet, INK_IDLE_MS);
  }

  /**
   * Turn the raw samples into an assignment.
   *
   * Simplified first, because a pen lays down hundreds of points that describe
   * a straight line. Then, if the coach asked for it, squared up — near-flat
   * segments go flat and the last point settles onto a yard — and only then
   * smoothed, so the corners that survive read as the curve the hand drew.
   * Squaring has to happen before smoothing or it would be straightening the
   * midpoints the smoother invented rather than the corners the hand turned at.
   */
  function commitStroke() {
    const pts = stroke.current;
    const owner = strokeOwner.current;
    stroke.current = null;
    strokeOwner.current = null;
    commitTimer.current = null;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = null;
    tapGuard.current = performance.now() + CHATTER_MS;
    ink.current?.clear();

    const svg = svgRef.current;
    if (!pts || pts.length < 2 || !svg) return;

    const yards = pts.map((q) => toYards(svg, q.x, q.y));

    // Furthest any sample strayed from the start. A stray contact never leaves.
    const span = yards.reduce(
      (far, q) => Math.max(far, Math.hypot(q.x - yards[0].x, q.y - yards[0].y)),
      0,
    );
    if (span < INK_MIN_SPAN) {
      if (TRACING) trace(`stroke discarded: ${pts.length} samples spanning ${span.toFixed(2)}yd`);
      return;
    }

    let shaped = simplify(yards, INK_TOLERANCE);
    if (settings.squareUpStrokes) shaped = snapEnd(straighten(shaped));

    const path = toSmoothPath(shaped);
    if (path.length < 2) return;

    // One width for the whole stroke, written onto every point so that an
    // erased fragment keeps the weight of the stroke it was cut from.
    const width = settings.pressureWidth
      ? widthFromPressure(pts.map((q) => q.p ?? 0))
      : undefined;
    const inked = width === undefined ? path : path.map((q) => ({ ...q, w: width }));

    if (TRACING) trace(`stroke committed: ${pts.length} samples -> ${path.length} points`);

    remember();
    if (owner) {
      // One drawn route per player; drawing again replaces it.
      setAssignments((prev) => [
        ...prev.filter((a) => !(a.playerId === owner && a.kind === 'route')),
        { id: inkId(), playerId: owner, kind: 'route', path: inked },
      ]);
    } else {
      setAnnotations((prev) => [...prev, inked]);
    }
  }

  /** A tap while the pencil is out: the first starts a stroke, the next ends it. */
  function down(e: React.PointerEvent, _svg: SVGSVGElement, at: Yards) {
    if (!accepts(e)) return;

    // A second tap ends the route. One tap starts it, the pen draws the shape
    // in between whether or not it is touching the glass.
    if (stroke.current) {
      // A bounce is not a second tap. Without this, the contact that follows
      // a starting tap by 10 to 25ms ends the stroke before it has begun.
      if (performance.now() - strokeAt.current < CHATTER_MS) {
        if (TRACING) trace(`${describeEvent(e, at)}\n            -> bounce ignored, still drawing`);
        return;
      }
      stroke.current.push({ x: e.clientX, y: e.clientY });
      if (TRACING) trace(`${describeEvent(e, at)}\n            -> stroke finished by tap`);
      commitStroke();
      return;
    }

    stroke.current = [{ x: e.clientX, y: e.clientY }];
    strokeAt.current = performance.now();
    strokeOwner.current = nearestPlayer(visible, at, INK_OWNER_YARDS)?.id ?? null;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(endStrokeWhenQuiet, INK_IDLE_MS);
    if (TRACING) {
      trace(
        `${describeEvent(e, at)}\n            -> stroke started` +
          `${strokeOwner.current ? ` for ${byId(strokeOwner.current)?.label}` : ' (annotation)'}`,
      );
    }
    return;
  }

  function move(e: React.PointerEvent, svg: SVGSVGElement) {
    /*
     * Raw updates carry one sample per event and are bound natively below, so
     * plain moves are ignored while they are arriving; handling both would
     * double every point. But the browser advertising pointerrawupdate is not
     * a promise that it fires for a hovering pen, and hover is how a stroke
     * gets its shape here. If none has arrived recently, take the move.
     */
    const rawFlowing = rawBound.current && performance.now() - lastRawAt.current < 100;
    if (stroke.current && !rawFlowing) extendStroke(e);
    else if (!stroke.current && e.pointerType !== 'touch') showAim(svg, e);
    return;
  }

  /**
   * The pen has gone quiet, so the stroke is over.
   *
   * Ended through the editor as it is *now*, not as it was when the timer was
   * set. A commit takes the snapshot undo steps back to, and one taken from a
   * stale render snapshots a board from before the last stroke — so stepping
   * back once after two strokes removed them both.
   */
  function endStrokeWhenQuiet() {
    ed.live().commitStroke();
  }

  return { accepts, extendStroke, commitStroke, down, move };
}

export type Ink = ReturnType<typeof createInk>;
