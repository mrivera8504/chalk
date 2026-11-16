import type { EditorCtx } from './context';
import { applyOnLine } from '../../domain/legality';
import { resizeFrom } from '../../render/Zone';
import { pxToYards, type Yards } from '../../render/geometry';
import { CHATTER_MS, DRAG_SLOP_PX, beyondSlop, dragTarget, panOffset, slideRoute, type DragState } from '../gesture';
import { TRACING, trace } from '../trace';

/**
 * Whatever is in hand — a man, a zone, the cone, a route's end, the board
 * itself — and where it goes as the pen moves. One path for all of them, which
 * is what gives each one tap-move-tap, bounce-resume and one step of undo.
 */

export function createDrag(ed: EditorCtx) {
  const {
    byId,
    carry,
    gestureRemembered,
    panFrom,
    remember,
    setAssignments,
    setCarrying,
    setFocuses,
    setPan,
    setPlayers,
    setVision,
    setZones,
    settings,
    tapGuard,
  } = ed;

  function dropCarried(reason: string) {
    const held = carry.current;
    carry.current = null;
    tapGuard.current = performance.now() + CHATTER_MS;
    setCarrying(null);
    if (TRACING && held) trace(`            -> placed ${byId(held.id)?.label} (${reason})`);
  }

  function moveCarried(svg: SVGSVGElement, at: Yards, client?: { x: number; y: number }) {
    const c = carry.current;
    if (!c) return;
    applyDrag(
      svg,
      { kind: c.kind, id: c.id, pt: c.pt, dx: c.dx, dy: c.dy, ox: 0, oy: 0, moved: true },
      at,
      client,
    );
  }

  /**
   * Move the player under a drag to a pointer position.
   *
   * Called from pointermove, and also from pointerdown when a bounce resumes.
   * The pen's contacts run 2-5ms, far too short for a move event to fire inside
   * one, and it travels while it is off the glass. So for this device the down
   * events carry nearly all the position information there is. Using them only
   * to choose a player, then waiting for a move that never arrives, is why a
   * drag picked the right man and then left him standing where he was.
   */
  function applyDrag(
    svg: SVGSVGElement,
    d: DragState,
    at: Yards,
    /** The same point in client pixels. Only the pan needs it; see below. */
    client?: { x: number; y: number },
  ): boolean {
    if (!d.moved) {
      if (!beyondSlop(d, at, pxToYards(svg, DRAG_SLOP_PX))) return false;
      d.moved = true;
    }

    /*
     * Sliding the window, and it comes first because it is the one drag that
     * changes nothing on the play.
     *
     * No snapshot: the view is not part of a play, so a step back over a pan
     * would be a step that undid nothing anyone could see. No grid and no
     * magnet either — those tidy a man onto a yard line, and this is not a man.
     *
     * Worked in pixels rather than in yards. Every other drag reads its target
     * off the live matrix, but a pan *is* a change to that matrix, so yards
     * taken from it are yards in a box that has already moved: the reading
     * chases its own tail and the board drifts. Pen travel across the glass is
     * the one quantity that stays still underneath the gesture, and the scale
     * is fixed for its whole length because zoom cannot change mid-drag. The
     * offset is set absolutely from where the grab began, never accumulated, so
     * a frame that renders late cannot leave the board a yard adrift.
     */
    if (d.kind === 'pan') {
      const from = panFrom.current;
      const ctm = svg.getScreenCTM();
      if (!from || !ctm || !client) return true;
      setPan(panOffset(from, client, ctm, ed.view));
      return true;
    }

    // The first movement of a gesture is the moment there is something to step
    // back over, and the snapshot taken here is still the pre-drag board.
    if (!gestureRemembered.current) {
      gestureRemembered.current = true;
      remember();
    }

    /*
     * Only the offense is magnetised to the line. A defender belongs head-up on
     * the ball often enough, and snapping him flush would sit him exactly on top
     * of the lineman he is over, which draws as one mark rather than two.
     *
     * Neither highlight is magnetised at all: the line of scrimmage means
     * nothing to where a quarterback is looking, nor to the patch of grass a
     * receiver is working into.
     */
    const onOffense = d.kind === 'player' && byId(d.id)?.side === 'offense';
    const step = settings.snapStepYards;
    const magnet = onOffense ? settings.losMagnetYards : 0;

    /*
     * A man is kept a yard inside the board so his mark and his number stay on
     * it. A zone's corner is not a man: a deep third is a third of the field,
     * and stopping its corner a yard short of the sideline meant the widest
     * zone the coverage tool draws could not be redrawn at the width it was
     * given. The corner may go to the edge; the middle of a box still may not,
     * or the box would slide off the board entirely.
     */
    const { x, y } = dragTarget(d, at, { step, magnet }, ed.view);

    if (d.kind === 'mark') {
      ed.setMarks((prev) => prev.map((m) => (m.id === d.id ? { ...m, x, y } : m)));
      return true;
    }
    if (d.kind === 'vision') {
      setVision({ x, y });
      return true;
    }
    if (d.kind === 'route-point') {
      setAssignments((prev) =>
        // Depth only, and the shape kept; see `slideRoute`.
        prev.map((a) => (a.id !== d.id || d.pt === undefined ? a : slideRoute(a, d.pt, y))),
      );
      return true;
    }
    if (d.kind === 'zone' || d.kind === 'zone-size') {
      setZones((prev) =>
        prev.map((z) => {
          if (z.playerId !== d.id) return z;
          // Moving keeps the box the size it is and puts its middle under the
          // pen; sizing pins the near corner and grows it out of that corner.
          return d.kind === 'zone' ? { ...z, x, y } : resizeFrom(z, { x, y });
        }),
      );
      return true;
    }
    if (d.kind === 'focus') {
      // The far end, stored as an offset from the man so it stays with him.
      // Dragging it out both aims the square and opens it up, since how far it
      // reaches is also how wide it is.
      const man = byId(d.id);
      if (man) {
        setFocuses((prev) =>
          prev.map((f) => (f.playerId === d.id ? { ...f, dx: x - man.x, dy: y - man.y } : f)),
        );
      }
      return true;
    }

    setPlayers((prev) =>
      applyOnLine(
        prev.map((p) => (p.id === d.id ? { ...p, x, y } : p)),
        settings,
      ),
    );
    return true;
  }

  return { dropCarried, moveCarried, applyDrag };
}

export type Drag = ReturnType<typeof createDrag>;
