import type { EditorCtx } from './context';
import { nearestPlayer, pickRadius, toYards } from '../../render/geometry';

/** The ring that follows a hovering pen, and says what a press would pick up. */

export function createAim(ed: EditorCtx) {
  const {
    aimQueued,
    aimRef,
    hoverRef,
    ringRef,
    setHoverId,
    visible,
  } = ed;

  /**
   * The pen hovers before it touches down, and the trace showed contact landing
   * two to three yards from where it had been hovering. With no feedback there
   * is no way to see that offset, let alone correct for it, so aim is guesswork.
   * Draw the tip, the reach around it, and ring whoever a press would pick up.
   *
   * Written straight to the DOM rather than through state: hover moves arrive
   * far faster than React should re-render. Only the ringed player, which
   * changes rarely, goes through state.
   */
  function showAim(svg: SVGSVGElement, e: React.PointerEvent) {
    // Hover arrives far faster than a frame. Coalesce, or the board re-renders
    // on every sample and the main thread has nothing left for real contacts.
    if (aimQueued.current) return;
    aimQueued.current = true;
    requestAnimationFrame(() => {
      aimQueued.current = false;
    });

    const at = toYards(svg, e.clientX, e.clientY);
    const radius = pickRadius(svg);

    aimRef.current?.setAttribute('transform', `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`);
    aimRef.current?.setAttribute('opacity', '1');
    ringRef.current?.setAttribute('r', radius.toFixed(2));

    const id = nearestPlayer(visible, at, radius)?.id ?? null;
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      setHoverId(id);
    }
  }

  function clearAim() {
    aimRef.current?.setAttribute('opacity', '0');
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      setHoverId(null);
    }
  }

  return { showAim, clearAim };
}

export type Aim = ReturnType<typeof createAim>;
