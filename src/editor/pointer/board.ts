import type { EditorCtx } from './context';
import { PLAYER_R } from '../../domain/types';
import { pickAt, pickRadius, toYards, type Yards } from '../../render/geometry';
import { CHATTER_MS, isContactBounce, type DragState } from '../gesture';
import { TRACING, describeEvent, trace } from '../trace';
import { type Aim } from './aim';
import { type Drag } from './drag';
import { type Grab } from './grab';
import { type Pairs } from './pairs';

/**
 * Picking things up and putting them down: every tap that is not ink, not the
 * eraser and not the board being slid.
 */

export function createBoard(ed: EditorCtx, aim: Aim, dragging: Drag, grab: Grab, pairs: Pairs) {
  const {
    byId,
    carry,
    drag,
    drawn,
    gestureRemembered,
    lastDrop,
    moveCount,
    panning,
    setCarrying,
    setPending,
    setSel,
    shown,
    stageRef,
    svgRef,
    tapGuard,
    tool,
    visible,
  } = ed;
  const { showAim } = aim;
  const { dropCarried, moveCarried, applyDrag } = dragging;
  const { grabRoutePoint, grabHighlight } = grab;
  const { handlePairTap } = pairs;

  /** A tap on the board with one of the picking tools out: Move, Routes, or a pair tool. */
  function down(e: React.PointerEvent, svg: SVGSVGElement, at: Yards) {

    /*
     * The S Pen breaks contact constantly. Traced on a Galaxy Ultra, one
     * deliberate press arrived as five pointerdown/pointerup pairs inside
     * 150ms, every one reporting pressure 0.00. So a bounce close in time and
     * space to a drag that just ended is the same gesture continuing, not a new
     * tap: resume the player already in hand rather than re-picking. Without
     * this, a bounce landing in open grass cleared the selection mid-drag.
     */
    const now = performance.now();

    /*
     * Carrying beats every other interpretation of a tap. The window guards
     * against this pen's contact bounce dropping the player the instant it was
     * picked up, since a bounce arrives 10 to 25ms after the tap that lifted it.
     */
    if (carry.current) {
      if (now - carry.current.at > CHATTER_MS) dropCarried('tapped down');
      return;
    }

    const bounce = lastDrop.current;
    if (tool === 'select' && isContactBounce(bounce, now, at)) {
      const held = bounce.kind === 'player' ? byId(bounce.id) : null;
      if (held || bounce.kind !== 'player') {
        /*
         * Carry the original grab offset rather than deriving a new one from
         * the player's position. Bounces land 10-25ms apart, inside a single
         * frame, so a re-render is not guaranteed and that position may be
         * stale. Keeping the offset also means the player tracks the pen
         * across the break, which is what a continuing gesture should do.
         */
        // Keep the original grab point too, so the slop is measured across the
        // whole gesture rather than restarting at every bounce.
        drag.current = {
          kind: bounce.kind,
          id: bounce.id,
          pt: bounce.pt,
          dx: bounce.dx,
          dy: bounce.dy,
          ox: bounce.ox,
          oy: bounce.oy,
          moved: bounce.moved,
        };
        if (held) setSel({ kind: 'player', id: held.id });
        try {
          stageRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        const moved = applyDrag(svg, drag.current, at, { x: e.clientX, y: e.clientY });
        if (TRACING) {
          trace(
            `${describeEvent(e, at)}\n            -> RESUMED ${held?.label ?? bounce.kind} ` +
              `(contact bounce, ${(now - bounce.at).toFixed(0)}ms gap)` +
              `${moved ? ' + moved' : ', within slop'}`,
          );
        }
        return;
      }
    }

    /*
     * A handle on the selected man's route beats everything else in Routes.
     * They are only drawn for the man in hand, so a tap on one is deliberate,
     * and the end of a route often lands on top of somebody else's mark.
     */
    const handle = tool === 'routes' ? grabRoutePoint(at, pickRadius(svg)) : null;
    if (handle) {
      drag.current = handle;
      gestureRemembered.current = false;
      try {
        stageRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* not fatal */
      }
      if (TRACING) trace(`${describeEvent(e, at)}\n            -> grabbed route point ${handle.pt}`);
      return;
    }

    const radius = pickRadius(svg);

    /*
     * One rule for what a tap is asking for, shared by every mode.
     *
     * A tap inside a player's mark is that player even when a line runs under
     * him. Measured on the device: five taps in a row 0.22 to 0.67 yards from a
     * guard, every one inside his mark, all selected the block line instead,
     * which is what "the pen will not select unless I press hard" turned out to
     * be. Pressing hard simply landed nearer his exact center than the line.
     */
    /*
     * Routes mode picks lines too, but it never selects one.
     *
     * It used to be given nothing, so a tap on a receiver's own route landed on
     * open grass and cleared him — and his color swatches with him. The line
     * resolves to the man who runs it instead, which opens the picker the
     * swatches are already in. So tapping a route is another way of tapping its
     * player, and there is still no line inspector over the board in Routes.
     */
    const lines = tool === 'select' || tool === 'routes' ? shown : [];
    const hit = pickAt(visible, lines, at, radius, PLAYER_R);
    const p = hit?.kind === 'player' ? byId(hit.id) : null;

    if (hit?.kind === 'assignment' && tool === 'routes') {
      const owner = byId(drawn.find((a) => a.id === hit.id)?.playerId);
      if (TRACING) {
        trace(
          `${describeEvent(e, at)}\n            -> a line at ${hit.distance.toFixed(2)}yd, ` +
            `opening ${owner?.label ?? 'nobody'}`,
        );
      }
      setSel(owner ? { kind: 'player', id: owner.id } : null);
      setPending(null);
      tapGuard.current = performance.now() + CHATTER_MS;
      return;
    }

    if (hit?.kind === 'assignment') {
      if (TRACING) {
        trace(
          `${describeEvent(e, at)}\n            -> picked a line at ${hit.distance.toFixed(2)}yd`,
        );
      }
      setPending(null);
      setSel({ kind: 'assignment', id: hit.id });
      return;
    }

    if (TRACING) {
      trace(
        `${describeEvent(e, at)}\n            -> ${
          p ? `picked ${p.label} at ${hit!.distance.toFixed(2)}yd` : 'NOTHING'
        } (radius ${radius.toFixed(2)}yd, tool ${tool})`,
      );
    }

    /*
     * Routes mode selects and nothing else. The man stays exactly where he is,
     * because choosing what he runs should never cost you the spot you spent a
     * drag putting him on.
     */
    if (tool === 'routes') {
      /*
       * The cone is swung here too, not only in Move. It is switched on from
       * this man's route list, and sending the coach to another mode to aim it
       * would be the two-trips problem the route picker exists to end. Nothing
       * about it moves a player, so the mode's own rule still holds.
       */
      const swing = p ? null : grabHighlight(at);
      if (swing) {
        drag.current = swing;
        gestureRemembered.current = false;
        try {
          stageRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        if (TRACING) trace(`${describeEvent(e, at)}\n            -> moving the ${swing.kind}`);
        return;
      }
      setSel(p ? { kind: 'player', id: p.id } : null);
      setPending(null);
      tapGuard.current = performance.now() + CHATTER_MS;
      return;
    }

    if (!p) {
      /*
       * Nobody there — so the cone gets its turn. It lies under the board and
       * covers a lot of grass, which is why this comes after the players and
       * the lines rather than before them.
       */
      const handle = grabHighlight(at);
      if (handle) {
        drag.current = handle;
        gestureRemembered.current = false;
        setSel(null);
        try {
          stageRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        if (TRACING) trace(`${describeEvent(e, at)}\n            -> grabbed the ${handle.kind}`);
        return;
      }
      setSel(null);
      setPending(null);
      return;
    }

    if (tool !== 'select') {
      handlePairTap(p);
      return;
    }

    drag.current = {
      kind: 'player',
      id: p.id,
      dx: p.x - at.x,
      dy: p.y - at.y,
      ox: at.x,
      oy: at.y,
      moved: false,
    };
    // A bounce resuming a drag deliberately does not reset this: it is the same
    // gesture continuing, and it must not cost a second step of undo.
    gestureRemembered.current = false;
    setSel({ kind: 'player', id: p.id });
    // Capture can throw if the pointer is already gone. The drag survives
    // without it, because every move bubbles back to this same element.
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
  }

  function move(e: React.PointerEvent, svg: SVGSVGElement, d: DragState | null) {
    if (!d) {
      if (carry.current) {
        moveCarried(svg, toYards(svg, e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
        return;
      }
      /*
       * Touch has no hover, so there is nothing to preview for a finger — and
       * the ring says what a press would pick up, which while the board tool is
       * out is nothing at all.
       */
      if (e.pointerType !== 'touch' && !panning) showAim(svg, e);
      // A move with no drag underway is either hover or a lost grip. Both are
      // worth seeing, but only occasionally, or the log is nothing else.
      if (TRACING && e.pointerType === 'pen' && moveCount.current++ % 25 === 0) {
        trace(`${describeEvent(e)}  [no drag underway]`);
      }
      return;
    }

    applyDrag(svg, d, toYards(svg, e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
    e.preventDefault();
  }

  function up(e: React.PointerEvent) {
    if (TRACING) trace(`${describeEvent(e)}  drag=${drag.current ? 'yes' : 'NONE'}`);

    // A lift means nothing while drawing: this pen lifts constantly. The idle
    // timer, or a second tap, is what ends a stroke.
    if (tool === 'draw' || tool === 'erase') return;
    if (!drag.current) return;

    // Provisional, not final: the pen may simply have bounced. handleStageDown
    // decides, by how soon and how near the next contact lands.
    const svg = svgRef.current;
    const at = svg ? toYards(svg, e.clientX, e.clientY) : null;
    lastDrop.current = at
      ? { ...drag.current, at: performance.now(), x: at.x, y: at.y }
      : null;

    /*
     * Contact that ended without traveling was a tap, so lift the player and
     * let him follow the pen. Holding contact and dragging still works and ends
     * here as it always did, which is what a finger does; this path is for a
     * pen that cannot hold contact at all.
     */
    if (!drag.current.moved && (tool === 'select' || drag.current.kind !== 'player')) {
      carry.current = { ...drag.current, at: performance.now() };
      setCarrying(drag.current.id);
      if (TRACING) trace(`            -> carrying ${byId(drag.current.id)?.label}`);
    }
    drag.current = null;
    try {
      stageRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  return { down, move, up };
}

export type Board = ReturnType<typeof createBoard>;
