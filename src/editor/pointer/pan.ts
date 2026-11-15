import type { EditorCtx } from './context';
import { type Yards } from '../../render/geometry';
import { CHATTER_MS, PAN_ID } from '../gesture';
import { TRACING, describeEvent, trace } from '../trace';
import { type Drag } from './drag';

/**
 * Sliding the board. Not a tool: nothing here picks anything up, and it beats
 * every tool because the toggle is a statement about what the next tap does.
 */

export function createPan(ed: EditorCtx, dragging: Drag) {
  const {
    carry,
    drag,
    gestureRemembered,
    pan,
    panFrom,
    stageRef,
  } = ed;
  const { dropCarried } = dragging;

  function down(e: React.PointerEvent, _svg: SVGSVGElement, at: Yards) {
    if (carry.current) {
      if (performance.now() - carry.current.at > CHATTER_MS) dropCarried('board set down');
      return;
    }
    panFrom.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
    drag.current = { kind: 'pan', id: PAN_ID, dx: 0, dy: 0, ox: at.x, oy: at.y, moved: false };
    gestureRemembered.current = false;
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
    if (TRACING) trace(`${describeEvent(e, at)}\n            -> grabbed the board`);
    return;
  }

  return { down };
}

export type Pan = ReturnType<typeof createPan>;
