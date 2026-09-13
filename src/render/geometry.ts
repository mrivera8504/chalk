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

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
