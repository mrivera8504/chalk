import type { EditorCtx } from './context';
import { eraseAt } from '../../domain/erase';
import { stuntPartner } from '../../domain/presets/links';
import { nearestAssignment, pxToYards, toYards, type Yards } from '../../render/geometry';
import { CHATTER_MS } from '../gesture';
import { type Aim } from './aim';
import { type Ink } from './ink';

/** The eraser: the same tap, travel, tap as drawing, and hovering counts. */

export function createEraser(ed: EditorCtx, aim: Aim, ink: Ink) {
  const {
    annotations,
    erasing,
    remember,
    setAnnotations,
    setAssignments,
    setErasing,
    setSel,
    shown,
    strokeAt,
    tapGuard,
  } = ed;
  const { showAim } = aim;
  const { accepts } = ink;

  /**
   * Rub out ink under the pen.
   *
   * Annotations erase partially, which is what the freehand layer is for. A
   * route or a block is a single assignment and goes whole, matching what the
   * Delete button in the inspector does, because half a block line means
   * nothing to anyone reading the sheet.
   */
  function eraseUnder(at: Yards, svg: SVGSVGElement) {
    const radius = Math.max(0.7, pxToYards(svg, 26));
    const left = eraseAt(annotations, at, radius);
    if (left) {
      setAnnotations(left);
      return;
    }
    const line = nearestAssignment(shown, at, radius);
    if (line) {
      // Whole, as Delete does — and a stunt's two halves go together, because
      // rubbing out one of them would leave a man looping behind nobody.
      setAssignments((prev) => {
        const partner = stuntPartner(line, prev);
        return prev.filter((a) => a.id !== line.id && a.id !== partner?.id);
      });
      setSel(null);
    }
  }

  function down(e: React.PointerEvent, svg: SVGSVGElement, at: Yards) {
    if (!accepts(e)) return;

    // A bounce is not a second tap. Same guard the stroke start needs.
    if (erasing) {
      if (performance.now() - strokeAt.current < CHATTER_MS) return;
      setErasing(false);
      tapGuard.current = performance.now() + CHATTER_MS;
      return;
    }

    // One snapshot for the whole sweep, so stepping back restores every line
    // the pen went over rather than the last few samples of it.
    remember();
    strokeAt.current = performance.now();
    setErasing(true);
    eraseUnder(at, svg);
    return;
  }

  function move(e: React.PointerEvent, svg: SVGSVGElement) {
    const at = toYards(svg, e.clientX, e.clientY);
    // Hovering counts. This pen is off the glass most of the time, and an
    // eraser that needed contact would be an eraser that never moved.
    if (erasing) eraseUnder(at, svg);
    else if (e.pointerType !== 'touch') showAim(svg, e);
    return;
  }

  return { eraseUnder, down, move };
}

export type Eraser = ReturnType<typeof createEraser>;
