import type { EditorCtx } from './context';
import { toYards } from '../../render/geometry';
import { TRACING, describeEvent, trace } from '../trace';
import { createAim } from './aim';
import { createBoard } from './board';
import { createDrag } from './drag';
import { createEraser } from './erase';
import { createGrab } from './grab';
import { createInk } from './ink';
import { createPairs } from './pairs';
import { createPan } from './pan';

/**
 * Everything the stage does with a pointer.
 *
 * `.stage` is the only element on the board that sees one, so this is the one
 * place a tap is turned into a decision. It was a single function in
 * `PlayEditor.tsx`; it is a dispatcher now, and each tool keeps its own rules
 * in its own file:
 *
 *   pan.ts     sliding the board
 *   erase.ts   the eraser
 *   ink.ts     freehand
 *   board.ts   picking up and setting down, for every other tool
 *   drag.ts    where the thing in hand goes — shared by all of the above
 *   grab.ts    route handles, zones, the focus square and the cone
 *   pairs.ts   block, man coverage and stunt: two taps
 *   aim.ts     the ring under a hovering pen
 *
 * Built once per render from the editor's current state, so every handler here
 * sees exactly the board the coach is looking at.
 */
export function createPointer(ed: EditorCtx) {
  const {
    carry,
    drag,
    panning,
    svgRef,
    tapGuard,
    tool,
  } = ed;

  const aim = createAim(ed);
  const dragging = createDrag(ed);
  const grab = createGrab(ed);
  const pairs = createPairs(ed);
  const ink = createInk(ed, aim);
  const eraser = createEraser(ed, aim, ink);
  const pan = createPan(ed, dragging);
  const board = createBoard(ed, aim, dragging, grab, pairs);

  function handleStageDown(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    // The inspector and the drawer float inside the stage; taps on either are
    // not board taps. Returning before preventDefault is what lets their
    // buttons behave like buttons. The drawer's own wrapper is inert, so this
    // only ever catches the panel and its tab.
    if ((e.target as Element).closest?.('.inspector, .drawer, .quick-bar')) return;
    e.preventDefault();

    const at = toYards(svg, e.clientX, e.clientY);
    aim.clearAim();

    // Nothing that just finished gets to be restarted by its own bounce.
    if (performance.now() < tapGuard.current && !carry.current) {
      if (TRACING) trace(`${describeEvent(e, at)}\n            -> bounce after a finished gesture, ignored`);
      return;
    }

    /*
     * Sliding the board beats every tool, because it is not one.
     *
     * Ahead of the pencil and the eraser deliberately: the toggle is a statement
     * about what the next tap does, and a coach who has said "move the board"
     * and then drawn a line across it would have caught the app lying. Nothing
     * here picks anything up, so no mode's own rule is broken by it.
     *
     * Tap, move the pen, tap — the same grammar as everything else, and it
     * comes free: the lift with no travel hands the board to `carry`, hover
     * moves slide it, and the next tap sets it down. A finger that holds
     * contact drags it directly, as a finger always has.
     */
    if (panning) return pan.down(e, svg, at);
    if (tool === 'erase') return eraser.down(e, svg, at);
    if (tool === 'draw') return ink.down(e, svg, at);
    return board.down(e, svg, at);
  }

  function handleMove(e: React.PointerEvent) {
    const d = drag.current;
    const svg = svgRef.current;
    if (!svg) return;

    /*
     * A move across a floating panel is not a move across the board.
     *
     * pointerdown has always been guarded, but this was not, so a carried
     * player followed the pen onto the inspector and was dropped wherever the
     * finger happened to land on it. Reaching for the route list flung him
     * downfield. A genuine drag is unaffected: it holds pointer capture on the
     * stage, so its events retarget there and never match this.
     */
    if (!d && (e.target as Element).closest?.('.inspector, .drawer, .quick-bar')) {
      aim.clearAim();
      return;
    }
    if (tool === 'erase') return eraser.move(e, svg);
    if (tool === 'draw') return ink.move(e, svg);
    return board.move(e, svg, d);
  }

  return {
    handleStageDown,
    handleMove,
    handleUp: board.up,
    clearAim: aim.clearAim,
    dropCarried: dragging.dropCarried,
    extendStroke: ink.extendStroke,
    commitStroke: ink.commitStroke,
  };
}

export type Pointer = ReturnType<typeof createPointer>;
