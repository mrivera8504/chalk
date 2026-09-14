import { useId } from 'react';
import type { PlayerSlot, Vision } from '../domain/types';

interface Props {
  /** The man it comes off. The apex is locked to him; only the focus moves. */
  qb: PlayerSlot;
  vision: Vision;
}

/** How wide the cone opens, each side of the line of sight. */
const HALF_ANGLE = 24;

/** Never a slit and never the whole field, however far the focus is dragged. */
const MIN_LEN = 2.5;
const MAX_LEN = 30;

/**
 * How long the cone actually is, which is the reach the focus was dragged to,
 * held between a stub and the whole field.
 */
export function coneLength(qb: PlayerSlot, vision: Vision): number {
  return Math.min(MAX_LEN, Math.max(MIN_LEN, Math.hypot(vision.x - qb.x, vision.y - qb.y)));
}

/**
 * Is this tap inside the cone?
 *
 * The cone is what you drag it by. There is no handle at the focus: a mark out
 * there among the routes read as another player, and the wash is an easy target
 * for a stylus this device hit-tests at the exact pixel. Grabbing anywhere in
 * it swings the whole look, apex still pinned to the quarterback.
 */
export function insideCone(qb: PlayerSlot, vision: Vision, at: { x: number; y: number }): boolean {
  const vx = at.x - qb.x;
  const vy = at.y - qb.y;
  const reach = Math.hypot(vx, vy);
  if (reach > coneLength(qb, vision)) return false;
  if (reach < 1e-6) return true;

  const ax = vision.x - qb.x;
  const ay = vision.y - qb.y;
  const axis = Math.hypot(ax, ay);
  if (axis < 1e-6) return false;

  // Angle off the line of sight, from the dot product of the two unit vectors.
  const cos = (vx * ax + vy * ay) / (reach * axis);
  return Math.acos(Math.min(1, Math.max(-1, cos))) <= (HALF_ANGLE * Math.PI) / 180;
}

/**
 * A faint cone from the quarterback to wherever he is looking.
 *
 * Drawn apex-up in its own frame and then rotated onto the line of sight, so
 * the geometry is written once and the gradient fades along the cone rather
 * than along the field. The gradient is in user space of that local frame,
 * which means it turns with the group for free.
 *
 * It is the first thing on the board after the turf and it never takes a
 * pointer: it has to sit under the routes, the blocks and the men, or a
 * highlight meant to draw the eye would be hiding the play it is highlighting.
 */
export function VisionCone({ qb, vision }: Props) {
  /*
   * The gradient needs a name, and a fixed one would collide: the playbook
   * screen puts a dozen thumbnails in one document, and the first <defs> to
   * declare an id is the one every reference resolves to — so every cone would
   * fade over the first card's length rather than its own.
   */
  const fadeId = `vision${useId().replace(/:/g, '')}`;
  const dx = vision.x - qb.x;
  const dy = vision.y - qb.y;
  const len = coneLength(qb, vision);

  // Local frame points down +y; rotate(a) sends (0,1) to (-sin a, cos a).
  const angle = (Math.atan2(-dx, dy) * 180) / Math.PI;

  const t = (HALF_ANGLE * Math.PI) / 180;
  const ex = len * Math.sin(t);
  const ey = len * Math.cos(t);

  /*
   * Apex, down the left edge, round the far arc, closed. Sweep flag 0: in SVG's
   * y-down space the arc from the left edge point to the right one runs the
   * negative-angle way, and flag 1 would bulge the cone backwards through the
   * quarterback.
   */
  const d = `M0 0 L${-ex.toFixed(3)} ${ey.toFixed(3)} A${len.toFixed(3)} ${len.toFixed(
    3,
  )} 0 0 0 ${ex.toFixed(3)} ${ey.toFixed(3)} Z`;

  return (
    <g pointerEvents="none">
      <defs>
        {/*
          * The stops are in the local frame, the rotated one the path is
          * drawn in, so the fade runs down the cone rather than down the
          * field and needs no transform of its own.
          */}
        <linearGradient
          id={fadeId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={0}
          y2={len}
        >
          <stop offset="0" stopColor="var(--vision)" stopOpacity={0.5} />
          <stop offset="0.65" stopColor="var(--vision)" stopOpacity={0.22} />
          <stop offset="1" stopColor="var(--vision)" stopOpacity={0} />
        </linearGradient>
      </defs>

      <g transform={`translate(${qb.x} ${qb.y}) rotate(${angle.toFixed(2)})`}>
        <path d={d} fill={`url(#${fadeId})`} />
      </g>

    </g>
  );
}
